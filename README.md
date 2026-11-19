# Personal OS Backend

## Production finance reset

Run only inside the production service shell, after confirming the service has the production `DATABASE_URL`:

```bash
pnpm reset:finance:production
```

The command requires an explicit confirmation environment variable:

```bash
CONFIRM_FINANCE_RESET="DELETE PRODUCTION DATA" pnpm reset:finance:production
```

This deletes transaction edit history and transactions, then resets every jar balance to zero. It does not delete todos or users.
