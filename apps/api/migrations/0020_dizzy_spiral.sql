PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_invitation` (
	`id` text PRIMARY KEY NOT NULL,
	`organizationId` text NOT NULL,
	`email` text NOT NULL,
	`role` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`teamId` text,
	`expiresAt` integer NOT NULL,
	`createdAt` integer NOT NULL,
	`inviterId` text NOT NULL,
	FOREIGN KEY (`organizationId`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`inviterId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);--> statement-breakpoint
INSERT INTO `__new_invitation`("id", "organizationId", "email", "role", "status", "teamId", "expiresAt", "createdAt", "inviterId") SELECT "id", "organizationId", "email", "role", "status", NULL, "expiresAt", "expiresAt" - 172800000, "inviterId" FROM `invitation`;--> statement-breakpoint
DROP TABLE `invitation`;--> statement-breakpoint
ALTER TABLE `__new_invitation` RENAME TO `invitation`;--> statement-breakpoint
PRAGMA foreign_keys=ON;
