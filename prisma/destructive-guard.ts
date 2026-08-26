export function assertDestructiveDatabaseOperation(flagName: string, operation: string) {
  if (process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production") {
    throw new Error(`${operation} is permanently disabled in production.`);
  }
  if (process.env[flagName] !== "true") {
    throw new Error(`${operation} refused. Set ${flagName}=true explicitly for a disposable development database.`);
  }
}
