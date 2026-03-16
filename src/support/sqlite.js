export function isSqliteUniqueConstraint(error) {
  const message = String(error?.message ?? "");
  return error?.code === "ERR_SQLITE_CONSTRAINT_UNIQUE" || /UNIQUE constraint failed/iu.test(message);
}
