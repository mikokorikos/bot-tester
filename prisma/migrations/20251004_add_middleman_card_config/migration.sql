CREATE TABLE IF NOT EXISTS `middlemen` (
  `user_id` BIGINT NOT NULL,
  `primary_roblox_identity_id` INT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `card_config` JSON NULL,
  PRIMARY KEY (`user_id`),
  INDEX `middlemen_primary_roblox_identity_id_idx` (`primary_roblox_identity_id`),
  CONSTRAINT `middlemen_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `middlemen_primary_roblox_identity_id_fkey` FOREIGN KEY (`primary_roblox_identity_id`) REFERENCES `user_roblox_identities`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET @column_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'middlemen'
    AND COLUMN_NAME = 'card_config'
);

SET @stmt := IF(
  @column_exists = 0,
  'ALTER TABLE `middlemen` ADD COLUMN `card_config` JSON NULL AFTER `updated_at`',
  'SELECT 1'
);

PREPARE alter_middlemen_card_config FROM @stmt;
EXECUTE alter_middlemen_card_config;
DEALLOCATE PREPARE alter_middlemen_card_config;
