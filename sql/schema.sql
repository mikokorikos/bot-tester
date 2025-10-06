-- =========================================
-- Dedos Shop Bot - Base de datos (Prisma v6)
-- =========================================

CREATE DATABASE IF NOT EXISTS dedos_shop
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE dedos_shop;

SET NAMES utf8mb4;
SET time_zone = "+00:00";
SET sql_mode = 'STRICT_ALL_TABLES,NO_ZERO_DATE,NO_ZERO_IN_DATE';

-- =========================================
-- Tablas base sincronizadas con prisma/schema.prisma
-- =========================================

CREATE TABLE IF NOT EXISTS `users` (
  `id` BIGINT UNSIGNED NOT NULL,
  `username` VARCHAR(191) NULL,
  `discriminator` VARCHAR(191) NULL,
  `global_name` VARCHAR(191) NULL,
  `avatar_hash` VARCHAR(191) NULL,
  `bot` TINYINT(1) NOT NULL DEFAULT 0,
  `first_seen_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `last_seen_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `warns` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `moderator_id` BIGINT UNSIGNED NULL,
  `severity` ENUM('MINOR','MAJOR','CRITICAL') NOT NULL,
  `reason` TEXT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `warns_user_id_created_at_idx` (`user_id`, `created_at` DESC),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `tickets` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `guild_id` BIGINT UNSIGNED NOT NULL,
  `channel_id` BIGINT UNSIGNED NOT NULL,
  `owner_id` BIGINT UNSIGNED NOT NULL,
  `type` ENUM('BUY','SELL','ROBUX','NITRO','DECOR','MM') NOT NULL,
  `status` ENUM('OPEN','CONFIRMED','CLAIMED','CLOSED') NOT NULL DEFAULT 'OPEN',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `closed_at` DATETIME(3) NULL,
  UNIQUE INDEX `tickets_channel_id_key` (`channel_id`),
  INDEX `tickets_owner_id_status_idx` (`owner_id`, `status`),
  INDEX `tickets_guild_id_created_at_idx` (`guild_id`, `created_at` DESC),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `ticket_participants` (
  `ticket_id` INT NOT NULL,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `role` VARCHAR(24) NULL,
  `joined_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `ticket_participants_user_id_idx` (`user_id`),
  PRIMARY KEY (`ticket_id`, `user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `user_roblox_identities` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `roblox_user_id` BIGINT NULL,
  `roblox_username` VARCHAR(191) NOT NULL,
  `verified` TINYINT(1) NOT NULL DEFAULT 0,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  `last_used_at` DATETIME(3) NULL,
  INDEX `user_roblox_identities_user_id_idx` (`user_id`),
  INDEX `user_roblox_identities_roblox_user_id_idx` (`roblox_user_id`),
  UNIQUE INDEX `user_roblox_identities_user_id_roblox_username_key` (`user_id`, `roblox_username`),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `middlemen` (
  `user_id` BIGINT UNSIGNED NOT NULL,
  `primary_roblox_identity_id` INT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `mm_trades` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `ticket_id` INT NOT NULL,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `roblox_identity_id` INT NULL,
  `roblox_username` VARCHAR(191) NOT NULL,
  `roblox_user_id` BIGINT NULL,
  `status` ENUM('PENDING','ACTIVE','COMPLETED','CANCELLED') NOT NULL DEFAULT 'PENDING',
  `confirmed` TINYINT(1) NOT NULL DEFAULT 0,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  INDEX `mm_trades_ticket_id_idx` (`ticket_id`),
  INDEX `mm_trades_user_id_idx` (`user_id`),
  INDEX `mm_trades_roblox_identity_id_idx` (`roblox_identity_id`),
  UNIQUE INDEX `mm_trades_ticket_id_user_id_key` (`ticket_id`, `user_id`),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `mm_trade_items` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `trade_id` INT NOT NULL,
  `item_name` VARCHAR(191) NOT NULL,
  `quantity` INT NOT NULL DEFAULT 1,
  `metadata` JSON NULL,
  INDEX `mm_trade_items_trade_id_idx` (`trade_id`),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `mm_claims` (
  `ticket_id` INT NOT NULL,
  `middleman_id` BIGINT UNSIGNED NOT NULL,
  `claimed_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `review_requested_at` DATETIME(3) NULL,
  `closed_at` DATETIME(3) NULL,
  `vouched` TINYINT(1) NOT NULL DEFAULT 0,
  `forced_close` TINYINT(1) NOT NULL DEFAULT 0,
  `panel_message_id` BIGINT NULL,
  `finalization_message_id` BIGINT NULL,
  INDEX `mm_claims_middleman_id_claimed_at_idx` (`middleman_id`, `claimed_at` DESC),
  PRIMARY KEY (`ticket_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `mm_reviews` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `ticket_id` INT NOT NULL,
  `reviewer_id` BIGINT UNSIGNED NOT NULL,
  `middleman_id` BIGINT UNSIGNED NOT NULL,
  `stars` INT NOT NULL,
  `review_text` TEXT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `mm_reviews_middleman_id_created_at_idx` (`middleman_id`, `created_at` DESC),
  UNIQUE INDEX `mm_reviews_ticket_id_reviewer_id_key` (`ticket_id`, `reviewer_id`),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `mm_trade_finalizations` (
  `ticket_id` INT NOT NULL,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `confirmed_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`ticket_id`, `user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `member_trade_stats` (
  `user_id` BIGINT UNSIGNED NOT NULL,
  `trades_completed` INT NOT NULL DEFAULT 0,
  `last_trade_at` DATETIME(3) NULL,
  `updated_at` DATETIME(3) NOT NULL,
  `preferred_roblox_identity_id` INT NULL,
  `partner_tag` VARCHAR(191) NULL,
  PRIMARY KEY (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `guild_members` (
  `guild_id` BIGINT UNSIGNED NOT NULL,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `nickname` VARCHAR(191) NULL,
  `joined_at` DATETIME(3) NULL,
  `last_seen_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `roles` JSON NULL,
  INDEX `guild_members_user_id_idx` (`user_id`),
  PRIMARY KEY (`guild_id`, `user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =========================================
-- Relaciones y llaves foráneas
-- =========================================

ALTER TABLE `warns`
  ADD CONSTRAINT `warns_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `warns_moderator_id_fkey` FOREIGN KEY (`moderator_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `tickets`
  ADD CONSTRAINT `tickets_owner_id_fkey` FOREIGN KEY (`owner_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `ticket_participants`
  ADD CONSTRAINT `ticket_participants_ticket_id_fkey` FOREIGN KEY (`ticket_id`) REFERENCES `tickets` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `ticket_participants_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `user_roblox_identities`
  ADD CONSTRAINT `user_roblox_identities_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `middlemen`
  ADD CONSTRAINT `middlemen_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `middlemen_primary_roblox_identity_id_fkey` FOREIGN KEY (`primary_roblox_identity_id`) REFERENCES `user_roblox_identities` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `mm_trades`
  ADD CONSTRAINT `mm_trades_ticket_id_fkey` FOREIGN KEY (`ticket_id`) REFERENCES `tickets` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `mm_trades_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `mm_trades_roblox_identity_id_fkey` FOREIGN KEY (`roblox_identity_id`) REFERENCES `user_roblox_identities` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `mm_trade_items`
  ADD CONSTRAINT `mm_trade_items_trade_id_fkey` FOREIGN KEY (`trade_id`) REFERENCES `mm_trades` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `mm_claims`
  ADD CONSTRAINT `mm_claims_ticket_id_fkey` FOREIGN KEY (`ticket_id`) REFERENCES `tickets` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `mm_claims_middleman_id_fkey` FOREIGN KEY (`middleman_id`) REFERENCES `middlemen` (`user_id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `mm_reviews`
  ADD CONSTRAINT `mm_reviews_ticket_id_fkey` FOREIGN KEY (`ticket_id`) REFERENCES `tickets` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `mm_reviews_reviewer_id_fkey` FOREIGN KEY (`reviewer_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `mm_reviews_middleman_id_fkey` FOREIGN KEY (`middleman_id`) REFERENCES `middlemen` (`user_id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `mm_trade_finalizations`
  ADD CONSTRAINT `mm_trade_finalizations_ticket_id_fkey` FOREIGN KEY (`ticket_id`) REFERENCES `tickets` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `mm_trade_finalizations_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `member_trade_stats`
  ADD CONSTRAINT `member_trade_stats_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `member_trade_stats_preferred_roblox_identity_id_fkey` FOREIGN KEY (`preferred_roblox_identity_id`) REFERENCES `user_roblox_identities` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `guild_members`
  ADD CONSTRAINT `guild_members_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;
