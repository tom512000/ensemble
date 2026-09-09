CREATE TABLE "game_results" (
	"id" uuid PRIMARY KEY NOT NULL,
	"room_id" uuid NOT NULL,
	"code" varchar(6) NOT NULL,
	"game_id" varchar(40) NOT NULL,
	"settings" jsonb NOT NULL,
	"players" jsonb NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone NOT NULL,
	"duration_ms" integer NOT NULL
);
