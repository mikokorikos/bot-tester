-- CreateTable
CREATE TABLE `users` (
    `id` BIGINT NOT NULL,
    `username` VARCHAR(191) NULL,
    `discriminator` VARCHAR(191) NULL,
    `global_name` VARCHAR(191) NULL,
    `avatar_hash` VARCHAR(191) NULL,
    `bot` BOOLEAN NOT NULL DEFAULT false,
    `first_seen_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `last_seen_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `warns` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` BIGINT NOT NULL,
    `moderator_id` BIGINT NULL,
    `severity` ENUM('MINOR', 'MAJOR', 'CRITICAL') NOT NULL,
    `reason` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `warns_user_id_created_at_idx`(`user_id`, `created_at` DESC),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `tickets` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `guild_id` BIGINT NOT NULL,
    `channel_id` BIGINT NOT NULL,
    `owner_id` BIGINT NOT NULL,
    `type` ENUM('BUY', 'SELL', 'ROBUX', 'NITRO', 'DECOR', 'MM') NOT NULL,
    `status` ENUM('OPEN', 'CONFIRMED', 'CLAIMED', 'CLOSED') NOT NULL DEFAULT 'OPEN',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `closed_at` DATETIME(3) NULL,

    UNIQUE INDEX `tickets_channel_id_key`(`channel_id`),
    INDEX `tickets_owner_id_status_idx`(`owner_id`, `status`),
    INDEX `tickets_guild_id_created_at_idx`(`guild_id`, `created_at` DESC),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ticket_participants` (
    `ticket_id` INTEGER NOT NULL,
    `user_id` BIGINT NOT NULL,
    `role` VARCHAR(24) NULL,
    `joined_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ticket_participants_user_id_idx`(`user_id`),
    PRIMARY KEY (`ticket_id`, `user_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `middlemen` (
    `user_id` BIGINT NOT NULL,
    `primary_roblox_identity_id` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `card_config` JSON NULL,

    PRIMARY KEY (`user_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `mm_trades` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `ticket_id` INTEGER NOT NULL,
    `user_id` BIGINT NOT NULL,
    `roblox_identity_id` INTEGER NULL,
    `roblox_username` VARCHAR(191) NOT NULL,
    `roblox_user_id` BIGINT NULL,
    `status` ENUM('PENDING', 'ACTIVE', 'COMPLETED', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
    `confirmed` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `mm_trades_ticket_id_idx`(`ticket_id`),
    INDEX `mm_trades_user_id_idx`(`user_id`),
    INDEX `mm_trades_roblox_identity_id_idx`(`roblox_identity_id`),
    UNIQUE INDEX `mm_trades_ticket_id_user_id_key`(`ticket_id`, `user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `mm_trade_items` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `trade_id` INTEGER NOT NULL,
    `item_name` VARCHAR(191) NOT NULL,
    `quantity` INTEGER NOT NULL DEFAULT 1,
    `metadata` JSON NULL,

    INDEX `mm_trade_items_trade_id_idx`(`trade_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `mm_claims` (
    `ticket_id` INTEGER NOT NULL,
    `middleman_id` BIGINT NOT NULL,
    `claimed_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `review_requested_at` DATETIME(3) NULL,
    `closed_at` DATETIME(3) NULL,
    `vouched` BOOLEAN NOT NULL DEFAULT false,
    `forced_close` BOOLEAN NOT NULL DEFAULT false,
    `panel_message_id` BIGINT NULL,
    `finalization_message_id` BIGINT NULL,

    INDEX `mm_claims_middleman_id_claimed_at_idx`(`middleman_id`, `claimed_at` DESC),
    PRIMARY KEY (`ticket_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `mm_reviews` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `ticket_id` INTEGER NOT NULL,
    `reviewer_id` BIGINT NOT NULL,
    `middleman_id` BIGINT NOT NULL,
    `stars` INTEGER NOT NULL,
    `review_text` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `mm_reviews_middleman_id_created_at_idx`(`middleman_id`, `created_at` DESC),
    UNIQUE INDEX `mm_reviews_ticket_id_reviewer_id_key`(`ticket_id`, `reviewer_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `mm_trade_finalizations` (
    `ticket_id` INTEGER NOT NULL,
    `user_id` BIGINT NOT NULL,
    `confirmed_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`ticket_id`, `user_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `member_trade_stats` (
    `user_id` BIGINT NOT NULL,
    `trades_completed` INTEGER NOT NULL DEFAULT 0,
    `last_trade_at` DATETIME(3) NULL,
    `updated_at` DATETIME(3) NOT NULL,
    `preferred_roblox_identity_id` INTEGER NULL,
    `partner_tag` VARCHAR(191) NULL,

    PRIMARY KEY (`user_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user_roblox_identities` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` BIGINT NOT NULL,
    `roblox_user_id` BIGINT NULL,
    `roblox_username` VARCHAR(191) NOT NULL,
    `verified` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `last_used_at` DATETIME(3) NULL,

    INDEX `user_roblox_identities_user_id_idx`(`user_id`),
    INDEX `user_roblox_identities_roblox_user_id_idx`(`roblox_user_id`),
    UNIQUE INDEX `user_roblox_identities_user_id_roblox_username_key`(`user_id`, `roblox_username`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `guild_members` (
    `guild_id` BIGINT NOT NULL,
    `user_id` BIGINT NOT NULL,
    `nickname` VARCHAR(191) NULL,
    `joined_at` DATETIME(3) NULL,
    `last_seen_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `roles` JSON NULL,

    INDEX `guild_members_user_id_idx`(`user_id`),
    PRIMARY KEY (`guild_id`, `user_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `warns` ADD CONSTRAINT `warns_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `warns` ADD CONSTRAINT `warns_moderator_id_fkey` FOREIGN KEY (`moderator_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `tickets` ADD CONSTRAINT `tickets_owner_id_fkey` FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ticket_participants` ADD CONSTRAINT `ticket_participants_ticket_id_fkey` FOREIGN KEY (`ticket_id`) REFERENCES `tickets`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ticket_participants` ADD CONSTRAINT `ticket_participants_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `middlemen` ADD CONSTRAINT `middlemen_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `middlemen` ADD CONSTRAINT `middlemen_primary_roblox_identity_id_fkey` FOREIGN KEY (`primary_roblox_identity_id`) REFERENCES `user_roblox_identities`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `mm_trades` ADD CONSTRAINT `mm_trades_ticket_id_fkey` FOREIGN KEY (`ticket_id`) REFERENCES `tickets`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `mm_trades` ADD CONSTRAINT `mm_trades_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `mm_trades` ADD CONSTRAINT `mm_trades_roblox_identity_id_fkey` FOREIGN KEY (`roblox_identity_id`) REFERENCES `user_roblox_identities`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `mm_trade_items` ADD CONSTRAINT `mm_trade_items_trade_id_fkey` FOREIGN KEY (`trade_id`) REFERENCES `mm_trades`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `mm_claims` ADD CONSTRAINT `mm_claims_ticket_id_fkey` FOREIGN KEY (`ticket_id`) REFERENCES `tickets`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `mm_claims` ADD CONSTRAINT `mm_claims_middleman_id_fkey` FOREIGN KEY (`middleman_id`) REFERENCES `middlemen`(`user_id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `mm_reviews` ADD CONSTRAINT `mm_reviews_ticket_id_fkey` FOREIGN KEY (`ticket_id`) REFERENCES `tickets`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `mm_reviews` ADD CONSTRAINT `mm_reviews_reviewer_id_fkey` FOREIGN KEY (`reviewer_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `mm_reviews` ADD CONSTRAINT `mm_reviews_middleman_id_fkey` FOREIGN KEY (`middleman_id`) REFERENCES `middlemen`(`user_id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `mm_trade_finalizations` ADD CONSTRAINT `mm_trade_finalizations_ticket_id_fkey` FOREIGN KEY (`ticket_id`) REFERENCES `tickets`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `mm_trade_finalizations` ADD CONSTRAINT `mm_trade_finalizations_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `member_trade_stats` ADD CONSTRAINT `member_trade_stats_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `member_trade_stats` ADD CONSTRAINT `member_trade_stats_preferred_roblox_identity_id_fkey` FOREIGN KEY (`preferred_roblox_identity_id`) REFERENCES `user_roblox_identities`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_roblox_identities` ADD CONSTRAINT `user_roblox_identities_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `guild_members` ADD CONSTRAINT `guild_members_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;


