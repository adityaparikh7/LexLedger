import { defineConfig } from 'drizzle-kit';

// Migrations are generated offline from the schema (`npm run db:generate`) and applied by the
// cloud server at startup.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/cloud/db/schema.ts',
  out: './drizzle',
});
