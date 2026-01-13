/**
 * Base Repository
 *
 * Generic repository base class that provides common CRUD operations.
 * Reduces code duplication across repository classes.
 *
 * Usage:
 * ```typescript
 * export class VaultRepository extends BaseRepository<VaultData> {
 *   protected model = prisma.vaultData;
 *
 *   // Add specialized methods here
 *   async findByCategory(userId: string, category: string) {
 *     return this.model.findMany({  where: { userId, category } });
 *   }
 * }
 * ```
 */

/**
 * Base repository class providing common CRUD operations
 *
 * @template T - The Prisma model type (e.g., VaultData, Consent, AuditLog)
 */
export abstract class BaseRepository<T> {
  /**
   * Prisma model delegate
   * Must be set by child class (e.g., prisma.vaultData)
   */
  protected abstract model: any;

  /**
   * Find a single record by ID
   *
   * @param id - Record ID
   * @returns Record or null if not found
   */
  async findById(id: string): Promise<T | null> {
    return this.model.findUnique({
      where: { id },
    });
  }

  /**
   * Find many records with optional filtering
   *
   * @param where - Optional Prisma where clause
   * @param orderBy - Optional Prisma orderBy clause (default: createdAt desc)
   * @returns Array of records
   */
  async findMany(where?: any, orderBy?: any): Promise<T[]> {
    return this.model.findMany({
      where,
      orderBy: orderBy || { createdAt: 'desc' },
    });
  }

  /**
   * Create a new record
   *
   * @param data - Data to create
   * @returns Created record
   */
  async create(data: any): Promise<T> {
    return this.model.create({
      data,
    });
  }

  /**
   * Update a record by ID
   *
   * @param id - Record ID
   * @param data - Data to update
   * @returns Updated record
   */
  async update(id: string, data: any): Promise<T> {
    return this.model.update({
      where: { id },
      data,
    });
  }

  /**
   * Delete a record by ID
   *
   * @param id - Record ID
   * @returns Deleted record
   */
  async delete(id: string): Promise<T> {
    return this.model.delete({
      where: { id },
    });
  }

  /**
   * Count records with optional filtering
   *
   * @param where - Optional Prisma where clause
   * @returns Count of records
   */
  async count(where?: any): Promise<number> {
    return this.model.count({
      where,
    });
  }

  /**
   * Check if a record belongs to a user
   * Assumes the model has a userId field
   *
   * @param id - Record ID
   * @param userId - User ID to check
   * @returns true if record belongs to user, false otherwise
   */
  async belongsToUser(id: string, userId: string): Promise<boolean> {
    const record = await this.model.findUnique({
      where: { id },
      select: { userId: true },
    });
    return record?.userId === userId;
  }

  /**
   * Find first record matching criteria
   *
   * @param where - Prisma where clause
   * @returns First matching record or null
   */
  async findFirst(where: any): Promise<T | null> {
    return this.model.findFirst({
      where,
    });
  }

  /**
   * Check if any records exist matching criteria
   *
   * @param where - Prisma where clause
   * @returns true if at least one record exists
   */
  async exists(where: any): Promise<boolean> {
    const count = await this.model.count({
      where,
      take: 1,
    });
    return count > 0;
  }

  /**
   * Delete many records matching criteria
   *
   * @param where - Prisma where clause
   * @returns Count of deleted records
   */
  async deleteMany(where: any): Promise<number> {
    const result = await this.model.deleteMany({
      where,
    });
    return result.count;
  }

  /**
   * Update many records matching criteria
   *
   * @param where - Prisma where clause
   * @param data - Data to update
   * @returns Count of updated records
   */
  async updateMany(where: any, data: any): Promise<number> {
    const result = await this.model.updateMany({
      where,
      data,
    });
    return result.count;
  }
}
