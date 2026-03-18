import { and, eq, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { appConfig, dailyNote, dailyTask, daySession, pomodoroSession } from '$lib/server/db/schema';

export async function claimLegacyDataForUser(userId: string) {
	const [hasOwnedTask, hasOwnedSession, hasOwnedNote, hasOwnedDaySession, hasOwnedConfig] =
		await Promise.all([
			db.query.dailyTask.findFirst({ where: eq(dailyTask.userId, userId) }),
			db.query.pomodoroSession.findFirst({ where: eq(pomodoroSession.userId, userId) }),
			db.query.dailyNote.findFirst({ where: eq(dailyNote.userId, userId) }),
			db.query.daySession.findFirst({ where: eq(daySession.userId, userId) }),
			db.query.appConfig.findFirst({ where: eq(appConfig.userId, userId) })
		]);

	if (hasOwnedTask || hasOwnedSession || hasOwnedNote || hasOwnedDaySession || hasOwnedConfig) {
		return false;
	}

	const [hasLegacyTask, hasLegacySession, hasLegacyNote, hasLegacyDaySession, hasLegacyConfig] =
		await Promise.all([
			db.query.dailyTask.findFirst({ where: isNull(dailyTask.userId) }),
			db.query.pomodoroSession.findFirst({ where: isNull(pomodoroSession.userId) }),
			db.query.dailyNote.findFirst({ where: isNull(dailyNote.userId) }),
			db.query.daySession.findFirst({ where: isNull(daySession.userId) }),
			db.query.appConfig.findFirst({ where: isNull(appConfig.userId) })
		]);

	if (!hasLegacyTask && !hasLegacySession && !hasLegacyNote && !hasLegacyDaySession && !hasLegacyConfig) {
		return false;
	}

	await db.update(dailyTask).set({ userId }).where(isNull(dailyTask.userId));
	await db.update(pomodoroSession).set({ userId }).where(isNull(pomodoroSession.userId));
	await db.update(dailyNote).set({ userId }).where(isNull(dailyNote.userId));
	await db.update(daySession).set({ userId }).where(isNull(daySession.userId));
	await db.update(appConfig).set({ userId }).where(isNull(appConfig.userId));

	return true;
}
