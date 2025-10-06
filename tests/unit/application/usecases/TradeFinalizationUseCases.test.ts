
import type { TextChannel } from 'discord.js';
import type { Logger } from 'pino';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as FinalizationPanel from '@/application/services/FinalizationPanelService';
import { RequestTradeClosureUseCase } from '@/application/usecases/middleman/RequestTradeClosureUseCase';
import { RevokeFinalizationUseCase } from '@/application/usecases/middleman/RevokeFinalizationUseCase';
import type { IMiddlemanFinalizationRepository } from '@/domain/repositories/IMiddlemanFinalizationRepository';
import type { IMiddlemanRepository } from '@/domain/repositories/IMiddlemanRepository';
import type { ITicketRepository } from '@/domain/repositories/ITicketRepository';
import { FINALIZATION_CANCEL_BUTTON_ID } from '@/presentation/components/buttons/FinalizationCancelButton';
import { FINALIZATION_CONFIRM_BUTTON_ID } from '@/presentation/components/buttons/FinalizationConfirmButton';
import type { EmbedFactory } from '@/presentation/embeds/EmbedFactory';
import { UnauthorizedActionError } from '@/shared/errors/domain.errors';

type PartialTicket = {
  readonly id: number;
  readonly ownerId: bigint;
  isClosed: () => boolean;
  isOwnedBy: (userId: bigint) => boolean;
};

const createLogger = (): Logger =>
  ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
    trace: vi.fn(),
    child: vi.fn().mockReturnThis(),
    level: 'silent',
  } as unknown as Logger);

const embedFactoryStub: EmbedFactory = {
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warning: vi.fn(),
  ticketCreated: vi.fn(),
  middlemanPanel: vi.fn(),
  reviewRequest: vi.fn(),
  reviewPublished: vi.fn(),
  finalizationPrompt: vi.fn(),
  stats: vi.fn(),
  warnApplied: vi.fn(),
  warnSummary: vi.fn(),
};

const renderFinalizationPanelMock = vi
  .spyOn(FinalizationPanel, 'renderFinalizationPanel')
  .mockResolvedValue(undefined);

describe('RequestTradeClosureUseCase', () => {
  const ticketId = 1;
  const middlemanId = BigInt('200');
  const ownerId = BigInt('100');

  let logger: Logger;
  let ticketRepo: ITicketRepository;
  let ticketRepoImpl: {
    findById: ReturnType<typeof vi.fn>;
    listParticipants: ReturnType<typeof vi.fn>;
    isParticipant: ReturnType<typeof vi.fn>;
  };
  let finalizationRepo: IMiddlemanFinalizationRepository;
  let finalizationRepoImpl: {
    listByTicket: ReturnType<typeof vi.fn>;
    withTransaction: ReturnType<typeof vi.fn>;
  };
  let middlemanRepo: IMiddlemanRepository;
  let middlemanRepoImpl: {
    getClaimByTicket: ReturnType<typeof vi.fn>;
    withTransaction: ReturnType<typeof vi.fn>;
  };
  let channel: TextChannel;
  let useCase: RequestTradeClosureUseCase;

  beforeEach(() => {
    logger = createLogger();

    ticketRepoImpl = {
      findById: vi.fn().mockResolvedValue({
        id: ticketId,
        ownerId,
        isClosed: () => false,
        isOwnedBy: (id: bigint) => id === ownerId,
      } satisfies PartialTicket),
      listParticipants: vi.fn().mockResolvedValue([
        { userId: ownerId, role: 'OWNER' },
        { userId: BigInt('300'), role: 'PARTNER' },
      ]),
      isParticipant: vi.fn().mockResolvedValue(true),
    };
    ticketRepo = {
      ...ticketRepoImpl,
      withTransaction: vi.fn().mockReturnThis(),
    } as unknown as ITicketRepository;

    finalizationRepoImpl = {
      listByTicket: vi.fn().mockResolvedValue([ownerId]),
      withTransaction: vi.fn().mockReturnThis(),
    };
    finalizationRepo = finalizationRepoImpl as unknown as IMiddlemanFinalizationRepository;

    middlemanRepoImpl = {
      getClaimByTicket: vi.fn().mockResolvedValue({
        ticketId,
        middlemanId,
        finalizationMessageId: null,
      }),
      withTransaction: vi.fn().mockReturnThis(),
    };
    middlemanRepo = middlemanRepoImpl as unknown as IMiddlemanRepository;

    const guild = {
      members: {
        fetch: vi.fn().mockImplementation(async (id: string) => ({
          displayName: `user-${id}`,
        })),
      },
    };

    channel = ({
      guild,
      send: vi.fn(),
    } as unknown) as TextChannel;

    useCase = new RequestTradeClosureUseCase(
      ticketRepo,
      finalizationRepo,
      middlemanRepo,
      embedFactoryStub,
      logger,
    );

    renderFinalizationPanelMock.mockClear();
    renderFinalizationPanelMock.mockResolvedValue(undefined);
  });

  it('should render panel and report pending completion', async () => {
    const result = await useCase.execute(ticketId, middlemanId, channel);

    expect(result.completed).toBe(false);
    expect(result.participantCount).toBe(2);
    expect(renderFinalizationPanelMock).toHaveBeenCalledWith(
      expect.objectContaining({
        cancelButtonId: FINALIZATION_CANCEL_BUTTON_ID,
        confirmButtonId: FINALIZATION_CONFIRM_BUTTON_ID,
      }),
    );
  });

  it('should throw when executed by non assigned middleman', async () => {
    middlemanRepoImpl.getClaimByTicket.mockResolvedValue({
      ticketId,
      middlemanId: BigInt('999'),
      finalizationMessageId: null,
    });

    await expect(useCase.execute(ticketId, middlemanId, channel)).rejects.toBeInstanceOf(
      UnauthorizedActionError,
    );
  });
});

describe('RevokeFinalizationUseCase', () => {
  const ticketId = 1;
  const ownerId = BigInt('100');
  const participantId = BigInt('300');

  let logger: Logger;
  let ticketRepo: ITicketRepository;
  let ticketRepoImpl: {
    findById: ReturnType<typeof vi.fn>;
    listParticipants: ReturnType<typeof vi.fn>;
    isParticipant: ReturnType<typeof vi.fn>;
  };
  let finalizationRepo: IMiddlemanFinalizationRepository;
  let finalizationRepoImpl: {
    listByTicket: ReturnType<typeof vi.fn>;
    revoke: ReturnType<typeof vi.fn>;
    withTransaction: ReturnType<typeof vi.fn>;
  };
  let middlemanRepo: IMiddlemanRepository;
  let middlemanRepoImpl: {
    getClaimByTicket: ReturnType<typeof vi.fn>;
    withTransaction: ReturnType<typeof vi.fn>;
  };
  let channel: TextChannel;
  let useCase: RevokeFinalizationUseCase;

  beforeEach(() => {
    logger = createLogger();

    ticketRepoImpl = {
      findById: vi.fn().mockResolvedValue({
        id: ticketId,
        ownerId,
        isClosed: () => false,
        isOwnedBy: (id: bigint) => id === ownerId,
      } satisfies PartialTicket),
      listParticipants: vi.fn().mockResolvedValue([
        { userId: ownerId, role: 'OWNER' },
        { userId: participantId, role: 'PARTNER' },
      ]),
      isParticipant: vi.fn().mockResolvedValue(true),
    };
    ticketRepo = {
      ...ticketRepoImpl,
      withTransaction: vi.fn().mockReturnThis(),
    } as unknown as ITicketRepository;

    finalizationRepoImpl = {
      listByTicket: vi.fn().mockResolvedValue([ownerId, participantId]),
      revoke: vi.fn().mockResolvedValue(undefined),
      withTransaction: vi.fn().mockReturnThis(),
    };
    finalizationRepo = finalizationRepoImpl as unknown as IMiddlemanFinalizationRepository;

    middlemanRepoImpl = {
      getClaimByTicket: vi.fn().mockResolvedValue({ ticketId, middlemanId: BigInt('200') }),
      withTransaction: vi.fn().mockReturnThis(),
    };
    middlemanRepo = middlemanRepoImpl as unknown as IMiddlemanRepository;

    const guild = {
      members: {
        fetch: vi.fn().mockImplementation(async (id: string) => ({
          displayName: `user-${id}`,
        })),
      },
    };

    channel = ({
      guild,
      send: vi.fn(),
    } as unknown) as TextChannel;

    useCase = new RevokeFinalizationUseCase(
      ticketRepo,
      finalizationRepo,
      middlemanRepo,
      embedFactoryStub,
      logger,
    );

    renderFinalizationPanelMock.mockClear();
    renderFinalizationPanelMock.mockResolvedValue(undefined);
  });

  it('should revoke confirmation when previously confirmed', async () => {
    const result = await useCase.execute(ticketId, participantId, channel);

    expect(result.previouslyConfirmed).toBe(true);
    expect(finalizationRepoImpl.revoke).toHaveBeenCalledWith(ticketId, participantId);
    expect(renderFinalizationPanelMock).toHaveBeenCalledWith(
      expect.objectContaining({
        cancelButtonId: FINALIZATION_CANCEL_BUTTON_ID,
      }),
    );
  });

  it('should not revoke if user had not confirmed', async () => {
    finalizationRepoImpl.listByTicket.mockResolvedValue([ownerId]);

    const result = await useCase.execute(ticketId, participantId, channel);

    expect(result.previouslyConfirmed).toBe(false);
    expect(finalizationRepoImpl.revoke).not.toHaveBeenCalled();
  });
});
