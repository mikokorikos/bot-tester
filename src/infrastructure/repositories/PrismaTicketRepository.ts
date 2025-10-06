// ============================================================================
// RUTA: src/infrastructure/repositories/PrismaTicketRepository.ts
// ============================================================================

import { Prisma, type PrismaClient } from '@prisma/client';

import { Ticket } from '@/domain/entities/Ticket';
import type { TicketType } from '@/domain/entities/types';
import { TicketStatus } from '@/domain/entities/types';
import type {
  CreateTicketData,
  ITicketRepository,
  TicketParticipantInput,
} from '@/domain/repositories/ITicketRepository';
import type { TransactionContext } from '@/domain/repositories/transaction';
import { ensureUsersExist } from '@/infrastructure/repositories/utils/ensureUsersExist';
import type { DiscordUserSnapshot } from '@/shared/types/discord';

const OPEN_STATUSES: TicketStatus[] = [
  TicketStatus.OPEN,
  TicketStatus.CONFIRMED,
  TicketStatus.CLAIMED,
];

type PrismaClientLike = PrismaClient | Prisma.TransactionClient;

type PrismaTicketWithRelations = Prisma.TicketGetPayload<{
  include: {
    middlemanClaim: true;
  };
}>;

type TicketSchemaMode = 'modern' | 'legacy';

interface TicketSchemaMetadata {
  readonly mode: TicketSchemaMode;
  readonly statusColumn: 'status' | 'status_id';
  readonly typeColumn: 'type' | 'type_id';
}

interface LegacyCatalogs {
  readonly statusCodeToId: Map<TicketStatus, number>;
  readonly typeCodeToId: Map<TicketType, number>;
}

interface LegacyTicketRow {
  readonly id: number;
  readonly guild_id: bigint;
  readonly channel_id: bigint;
  readonly owner_id: bigint;
  readonly type_value: string;
  readonly status_value: string;
  readonly created_at: Date;
  readonly closed_at: Date | null;
  readonly middleman_id: bigint | null;
}

interface CountRow {
  readonly count: bigint;
}

interface InsertIdRow {
  readonly id: number;
}

const mapParticipant = (participant: TicketParticipantInput) => ({
  userId: participant.userId,
  role: participant.role ?? null,
  joinedAt: participant.joinedAt ?? new Date(),
});

export class PrismaTicketRepository implements ITicketRepository {
  private static schemaMetadataPromise?: Promise<TicketSchemaMetadata>;

  private static legacyCatalogPromise?: Promise<LegacyCatalogs>;

  public constructor(private readonly prisma: PrismaClientLike) {}

  public withTransaction(context: TransactionContext): ITicketRepository {
    if (!PrismaTicketRepository.isTransactionClient(context)) {
      throw new Error('Invalid Prisma transaction context provided to ticket repository.');
    }

    return new PrismaTicketRepository(context);
  }

  public async create(data: CreateTicketData): Promise<Ticket> {
    const schema = await this.getSchemaMetadata();

    const snapshotLookup = new Map<bigint, DiscordUserSnapshot>();
    data.userSnapshots?.forEach((snapshot) => {
      snapshotLookup.set(snapshot.id, snapshot);
    });

    await ensureUsersExist(this.prisma, [
      snapshotLookup.get(data.ownerId) ?? data.ownerId,
      ...(data.participants?.map((participant) => snapshotLookup.get(participant.userId) ?? participant.userId) ?? []),
    ]);

    if (schema.mode === 'modern') {
      const ticket = await this.prisma.ticket.create({
        data: {
          guildId: data.guildId,
          channelId: data.channelId,
          ownerId: data.ownerId,
          type: data.type,
          status: data.status ?? TicketStatus.OPEN,
          participants: data.participants
            ? {
                create: data.participants.map(mapParticipant),
              }
            : undefined,
        },
        include: { middlemanClaim: true },
      });

      return this.toDomainFromModern(ticket);
    }

    return this.createLegacy(data, schema);
  }

  public async findById(id: number): Promise<Ticket | null> {
    const schema = await this.getSchemaMetadata();

    if (schema.mode === 'modern') {
      const ticket = await this.prisma.ticket.findUnique({
        where: { id },
        include: { middlemanClaim: true },
      });

      return ticket ? this.toDomainFromModern(ticket) : null;
    }

    const rows = await this.fetchLegacyTickets(Prisma.sql`t.id = ${id}`, schema);
    const row = rows[0];

    return row ? this.toDomainFromLegacy(row) : null;
  }

  public async findByChannelId(channelId: bigint): Promise<Ticket | null> {
    const schema = await this.getSchemaMetadata();

    if (schema.mode === 'modern') {
      const ticket = await this.prisma.ticket.findUnique({
        where: { channelId },
        include: { middlemanClaim: true },
      });

      return ticket ? this.toDomainFromModern(ticket) : null;
    }

    const rows = await this.fetchLegacyTickets(Prisma.sql`t.channel_id = ${channelId}`, schema);
    const row = rows[0];

    return row ? this.toDomainFromLegacy(row) : null;
  }

  public async findOpenByOwner(ownerId: bigint): Promise<readonly Ticket[]> {
    const schema = await this.getSchemaMetadata();

    if (schema.mode === 'modern') {
      const tickets: PrismaTicketWithRelations[] = await this.prisma.ticket.findMany({
        where: {
          ownerId,
          status: { in: OPEN_STATUSES },
        },
        include: { middlemanClaim: true },
      });

      return tickets.map((ticket) => this.toDomainFromModern(ticket));
    }

    const condition = this.buildStatusCondition(schema, OPEN_STATUSES);
    const rows = await this.fetchLegacyTickets(
      Prisma.sql`t.owner_id = ${ownerId} AND ${condition}`,
      schema,
    );

    return rows.map((row) => this.toDomainFromLegacy(row));
  }

  public async update(ticket: Ticket): Promise<void> {
    const schema = await this.getSchemaMetadata();

    if (schema.mode === 'modern') {
      await this.prisma.ticket.update({
        where: { id: ticket.id },
        data: {
          status: ticket.status,
          closedAt: ticket.closedAt ?? null,
        },
      });

      return;
    }

    await this.updateLegacyTicket(ticket, schema);
  }

  public async delete(id: number): Promise<void> {
    await this.prisma.ticket.delete({ where: { id } });
  }

  public async countOpenByOwner(ownerId: bigint): Promise<number> {
    const schema = await this.getSchemaMetadata();

    if (schema.mode === 'modern') {
      return this.prisma.ticket.count({
        where: {
          ownerId,
          status: { in: OPEN_STATUSES },
        },
      });
    }

    const condition = this.buildStatusCondition(schema, OPEN_STATUSES);
    const rows = await this.prisma.$queryRaw<CountRow[]>(
      Prisma.sql`
        SELECT COUNT(*) AS count
        FROM tickets t
        ${this.legacyStatusJoin(schema)}
        WHERE t.owner_id = ${ownerId}
          AND ${condition}
      `,
    );

    const count = rows[0]?.count ?? 0n;

    return Number(count);
  }

  public async isParticipant(ticketId: number, userId: bigint): Promise<boolean> {
    const participant = await this.prisma.ticketParticipant.findFirst({
      where: {
        ticketId,
        userId,
      },
    });

    return participant !== null;
  }

  public async listParticipants(ticketId: number): Promise<readonly TicketParticipantInput[]> {
    const participants = await this.prisma.ticketParticipant.findMany({
      where: { ticketId },
    });

    return participants.map((participant) => ({
      userId: participant.userId,
      role: participant.role,
      joinedAt: participant.joinedAt,
    }));
  }

  private async createLegacy(data: CreateTicketData, schema: TicketSchemaMetadata): Promise<Ticket> {
    const catalogs = await this.getLegacyCatalogs();
    const statusId = catalogs.statusCodeToId.get(data.status ?? TicketStatus.OPEN);

    if (statusId === undefined) {
      throw new Error(`Unknown ticket status provided: ${data.status ?? TicketStatus.OPEN}`);
    }

    const typeValue = this.resolveLegacyTypeValue(data.type, catalogs, schema);

    await this.prisma.$executeRaw(
      Prisma.sql`
        INSERT INTO tickets (guild_id, channel_id, owner_id, ${Prisma.raw(schema.typeColumn)}, ${Prisma.raw(schema.statusColumn)})
        VALUES (${data.guildId}, ${data.channelId}, ${data.ownerId}, ${typeValue}, ${statusId})
      `,
    );

    const insertRows = await this.prisma.$queryRaw<InsertIdRow[]>(Prisma.sql`SELECT LAST_INSERT_ID() AS id`);
    const ticketId = insertRows[0]?.id;

    if (ticketId === undefined) {
      throw new Error('Failed to retrieve ticket identifier after insert.');
    }

    if (data.participants && data.participants.length > 0) {
      await this.prisma.ticketParticipant.createMany({
        data: data.participants.map((participant) => ({
          ticketId,
          userId: participant.userId,
          role: participant.role ?? null,
          joinedAt: participant.joinedAt ?? new Date(),
        })),
      });
    }

    const rows = await this.fetchLegacyTickets(Prisma.sql`t.id = ${ticketId}`, schema);
    const row = rows[0];

    if (!row) {
      throw new Error('Failed to load ticket after insert.');
    }

    return this.toDomainFromLegacy(row);
  }

  private async fetchLegacyTickets(where: Prisma.Sql, schema: TicketSchemaMetadata): Promise<LegacyTicketRow[]> {
    const columns = Prisma.sql`
      t.id,
      t.guild_id,
      t.channel_id,
      t.owner_id,
      ${schema.typeColumn === 'type'
        ? Prisma.sql`t.type AS type_value`
        : Prisma.sql`tt.name AS type_value`},
      ${schema.statusColumn === 'status'
        ? Prisma.sql`t.status AS status_value`
        : Prisma.sql`ts.name AS status_value`},
      t.created_at,
      t.closed_at,
      mc.middleman_id
    `;

    const query = Prisma.sql`
      SELECT ${columns}
      FROM tickets t
      LEFT JOIN mm_claims mc ON mc.ticket_id = t.id
      ${schema.typeColumn === 'type' ? Prisma.empty : Prisma.sql`LEFT JOIN ticket_types tt ON tt.id = t.type_id`}
      ${schema.statusColumn === 'status' ? Prisma.empty : Prisma.sql`LEFT JOIN ticket_statuses ts ON ts.id = t.status_id`}
      WHERE ${where}
    `;

    return this.prisma.$queryRaw<LegacyTicketRow[]>(query);
  }

  private async updateLegacyTicket(ticket: Ticket, schema: TicketSchemaMetadata): Promise<void> {
    const catalogs = await this.getLegacyCatalogs();
    const statusId = catalogs.statusCodeToId.get(ticket.status);

    if (statusId === undefined) {
      throw new Error(`Unknown ticket status provided: ${ticket.status}`);
    }

    await this.prisma.$executeRaw(
      Prisma.sql`
        UPDATE tickets
        SET ${Prisma.raw(schema.statusColumn)} = ${statusId},
            closed_at = ${ticket.closedAt ?? null}
        WHERE id = ${ticket.id}
      `,
    );
  }

  private legacyStatusJoin(schema: TicketSchemaMetadata): Prisma.Sql {
    return schema.statusColumn === 'status'
      ? Prisma.empty
      : Prisma.sql`LEFT JOIN ticket_statuses ts ON ts.id = t.status_id`;
  }

  private buildStatusCondition(
    schema: TicketSchemaMetadata,
    statuses: readonly TicketStatus[] | TicketStatus,
  ): Prisma.Sql {
    const statusList = Array.isArray(statuses) ? statuses : [statuses];
    const joined = Prisma.join(statusList.map((status) => Prisma.sql`${status}`));

    if (schema.statusColumn === 'status') {
      return Array.isArray(statuses)
        ? Prisma.sql`t.status IN (${joined})`
        : Prisma.sql`t.status = ${statusList[0]}`;
    }

    return Array.isArray(statuses)
      ? Prisma.sql`ts.name IN (${joined})`
      : Prisma.sql`ts.name = ${statusList[0]}`;
  }

  private resolveLegacyTypeValue(
    type: TicketType,
    catalogs: LegacyCatalogs,
    schema: TicketSchemaMetadata,
  ): Prisma.Sql {
    if (schema.typeColumn === 'type') {
      return Prisma.sql`${type}`;
    }

    const typeId = catalogs.typeCodeToId.get(type);

    if (typeId === undefined) {
      throw new Error(`Unknown ticket type provided: ${type}`);
    }

    return Prisma.sql`${typeId}`;
  }

  private toDomainFromModern(ticket: PrismaTicketWithRelations): Ticket {
    return this.toDomainTicket({
      id: ticket.id,
      guildId: ticket.guildId,
      channelId: ticket.channelId,
      ownerId: ticket.ownerId,
      type: ticket.type as TicketType,
      status: ticket.status as TicketStatus,
      createdAt: ticket.createdAt,
      closedAt: ticket.closedAt ?? null,
      middlemanId: ticket.middlemanClaim?.middlemanId ?? null,
    });
  }

  private toDomainFromLegacy(row: LegacyTicketRow): Ticket {
    return this.toDomainTicket({
      id: row.id,
      guildId: row.guild_id,
      channelId: row.channel_id,
      ownerId: row.owner_id,
      type: row.type_value.toUpperCase() as TicketType,
      status: row.status_value.toUpperCase() as TicketStatus,
      createdAt: row.created_at,
      closedAt: row.closed_at,
      middlemanId: row.middleman_id,
    });
  }

  private toDomainTicket(record: {
    readonly id: number;
    readonly guildId: bigint;
    readonly channelId: bigint;
    readonly ownerId: bigint;
    readonly type: TicketType;
    readonly status: TicketStatus;
    readonly createdAt: Date;
    readonly closedAt: Date | null;
    readonly middlemanId: bigint | null;
  }): Ticket {
    return new Ticket(
      record.id,
      record.guildId,
      record.channelId,
      record.ownerId,
      record.type,
      record.status,
      record.createdAt,
      record.closedAt ?? undefined,
      record.middlemanId ?? undefined,
    );
  }

  private async getSchemaMetadata(): Promise<TicketSchemaMetadata> {
    if (!PrismaTicketRepository.schemaMetadataPromise) {
      PrismaTicketRepository.schemaMetadataPromise = this.detectSchemaMetadata();
    }

    return PrismaTicketRepository.schemaMetadataPromise;
  }

  private async detectSchemaMetadata(): Promise<TicketSchemaMetadata> {
    const columns = await this.prisma.$queryRaw<{ COLUMN_NAME: string }[]>(
      Prisma.sql`
        SELECT COLUMN_NAME
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tickets'
      `,
    );

    const columnNames = new Set(columns.map((column) => column.COLUMN_NAME));
    const hasStatus = columnNames.has('status');
    const hasStatusId = columnNames.has('status_id');
    const hasType = columnNames.has('type');
    const hasTypeId = columnNames.has('type_id');

    if (hasStatus) {
      return {
        mode: 'modern',
        statusColumn: 'status',
        typeColumn: hasType ? 'type' : hasTypeId ? 'type_id' : 'type',
      };
    }

    if (hasStatusId) {
      return {
        mode: 'legacy',
        statusColumn: 'status_id',
        typeColumn: hasType ? 'type' : hasTypeId ? 'type_id' : 'type',
      };
    }

    throw new Error('Unable to determine ticket status column in database schema.');
  }

  private async getLegacyCatalogs(): Promise<LegacyCatalogs> {
    if (!PrismaTicketRepository.legacyCatalogPromise) {
      PrismaTicketRepository.legacyCatalogPromise = this.loadLegacyCatalogs();
    }

    return PrismaTicketRepository.legacyCatalogPromise;
  }

  private async loadLegacyCatalogs(): Promise<LegacyCatalogs> {
    const [statusRows, typeRows] = await Promise.all([
      this.prisma.$queryRaw<{ id: number; name: string }[]>(Prisma.sql`SELECT id, name FROM ticket_statuses`),
      this.prisma.$queryRaw<{ id: number; name: string }[]>(Prisma.sql`SELECT id, name FROM ticket_types`),
    ]);

    const statusCodeToId = new Map<TicketStatus, number>();

    for (const row of statusRows) {
      const statusName = row.name.toUpperCase() as TicketStatus;
      statusCodeToId.set(statusName, row.id);
    }

    const typeCodeToId = new Map<TicketType, number>();

    for (const row of typeRows) {
      const typeName = row.name.toUpperCase() as TicketType;
      typeCodeToId.set(typeName, row.id);
    }

    return {
      statusCodeToId,
      typeCodeToId,
    };
  }

  private static isTransactionClient(value: TransactionContext): value is Prisma.TransactionClient {
    return typeof value === 'object' && value !== null && 'ticket' in value;
  }
}
