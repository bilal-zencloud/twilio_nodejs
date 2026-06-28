/**
 * Base tenant scope — every repository requires an accountId.
 * No tenant-scoped query runs without an explicit account scope.
 */
class TenantScope {
  constructor(accountId) {
    if (!accountId || typeof accountId !== 'string') {
      throw new Error('accountId is required for tenant-scoped data access');
    }
    this.accountId = accountId;
  }
}

module.exports = TenantScope;
