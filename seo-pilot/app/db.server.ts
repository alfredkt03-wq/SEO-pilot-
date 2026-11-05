import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var prismaGlobal: PrismaClient;
  // eslint-disable-next-line no-var
  var dbKeepWarm: ReturnType<typeof setInterval> | undefined;
}

if (process.env.NODE_ENV !== "production") {
  if (!global.prismaGlobal) {
    global.prismaGlobal = new PrismaClient();
  }
}

const prisma: PrismaClient = global.prismaGlobal ?? new PrismaClient();

// Open the database connection at boot instead of on the first merchant
// request, so a cold start doesn't add the connect time to that page load.
prisma.$connect().catch(() => {});

// Neon suspends an idle database after ~5 minutes, and the first query after
// that pays a multi-second wake-up (this was the slow first page load).
// A cheap ping every 4 minutes keeps it awake. Failures are ignored.
if (process.env.NODE_ENV === "production" && !global.dbKeepWarm) {
  global.dbKeepWarm = setInterval(() => {
    prisma.$queryRaw`SELECT 1`.catch(() => {});
  }, 4 * 60 * 1000);
  global.dbKeepWarm.unref?.();
}

export default prisma;
