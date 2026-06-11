import { createDatabaseConnection } from "./db/connection.js";
import { runMigrations } from "./db/migrate.js";
import { createApp } from "./app.js";

const port = Number(process.env.PORT ?? 3001);
const database = createDatabaseConnection();

runMigrations(database);
const app = createApp(database);

app.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
});
