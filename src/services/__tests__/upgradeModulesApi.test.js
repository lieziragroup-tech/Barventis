import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fefoApi, adjustmentApi, maintenanceApi, vendorApi, parStockApi, menuEngApi } from '../upgradeModulesApi';
import { supabase } from '../../lib/supabase';
import { api } from '../api';

vi.mock('../../lib/supabase', () => {
  const chainable = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    gt: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: {}, error: null }),
    update: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    then: vi.fn((cb) => cb({ data: [], error: null }))
  };
  return {
    supabase: {
      from: vi.fn(() => chainable)
    }
  };
});

vi.mock('../api', () => ({
  api: {
    getActiveTenantId: vi.fn().mockResolvedValue('test-tenant-123'),
    getActiveUserId: vi.fn().mockResolvedValue('test-user-123'),
    getMaterials: vi.fn().mockResolvedValue([])
  }
}));

describe('upgradeModulesApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('fefoApi', () => {
    it('getBatches calls supabase with correct filters', async () => {
      await fefoApi.getBatches();
      expect(supabase.from).toHaveBeenCalledWith('material_batches');
      const chain = supabase.from();
      expect(chain.select).toHaveBeenCalled();
      expect(chain.eq).toHaveBeenCalledWith('tenant_id', 'test-tenant-123');
      expect(chain.eq).toHaveBeenCalledWith('status', 'active');
      expect(chain.order).toHaveBeenCalledWith('expiry_date', { ascending: true });
    });

    it('getExpiringItems filters by cutoff date', async () => {
      await fefoApi.getExpiringItems(3);
      const chain = supabase.from();
      expect(chain.lte).toHaveBeenCalledWith('expiry_date', expect.any(String));
    });
  });

  describe('adjustmentApi', () => {
    it('createAdjustment sends requested_by', async () => {
      await adjustmentApi.createAdjustment({
        material_id: 'm1', opname_date: '2026-09-24', system_qty: 10, physical_qty: 8, variance_pct: -20, reason: 'Test'
      });
      const chain = supabase.from();
      expect(chain.insert).toHaveBeenCalledWith(expect.objectContaining({
        requested_by: 'test-user-123',
        tenant_id: 'test-tenant-123',
        variance_pct: -20
      }));
    });

    it('approveAdjustment updates status and approved_by', async () => {
      await adjustmentApi.approveAdjustment('adj-1');
      const chain = supabase.from();
      expect(chain.update).toHaveBeenCalledWith(expect.objectContaining({
        status: 'approved',
        approved_by: 'test-user-123'
      }));
      expect(chain.eq).toHaveBeenCalledWith('id', 'adj-1');
    });
  });

  describe('maintenanceApi', () => {
    it('createServiceLog includes parts and cost', async () => {
      await maintenanceApi.createServiceLog({
        asset_id: 'a1', service_type: 'PREVENTIVE', description: 'Fix', performed_by: 'John',
        performed_at: '2026-09-24', next_due_date: '2026-10-24', parts_replaced: 'Filter', cost: 150000
      });
      const chain = supabase.from();
      expect(chain.insert).toHaveBeenCalledWith(expect.objectContaining({
        asset_id: 'a1',
        parts_replaced: 'Filter',
        cost: 150000
      }));
    });
  });

  describe('vendorApi', () => {
    it('updateVendorScore calculates atomic increment correctly', async () => {
      const chain = supabase.from();
      chain.single.mockResolvedValueOnce({
        data: { total_deliveries: 10, on_time_deliveries: 8, rejection_rate: 5.0 },
        error: null
      });

      await vendorApi.updateVendorScore('sup-1', { on_time: true, accepted: false });
      
      expect(chain.update).toHaveBeenCalledWith(expect.objectContaining({
        total_deliveries: 11,
        on_time_deliveries: 9,
        otif_score: 81.8,
        rejection_rate: 6.0
      }));
    });
  });

  describe('menuEngApi', () => {
    it('classifyMenuItems handles empty data', async () => {
      supabase.from().then.mockImplementationOnce(cb => cb({ data: [], error: null }));
      const result = await menuEngApi.classifyMenuItems();
      expect(result).toEqual([]);
    });

    it('classifyMenuItems applies STAR/DOG logic based on medians', async () => {
      // Mock v_menu_engineering return
      supabase.from().then.mockImplementationOnce(cb => cb({
        data: [
          { id: 1, margin: 100, total_sold: 100 }, // STAR
          { id: 2, margin: 10, total_sold: 10 },   // DOG
          { id: 3, margin: 100, total_sold: 10 },  // PUZZLE
          { id: 4, margin: 10, total_sold: 100 }   // PLOWHORSE
        ], error: null
      }));

      const result = await menuEngApi.classifyMenuItems();
      expect(result.find(i => i.id === 1).menu_class).toBe('STAR');
      expect(result.find(i => i.id === 2).menu_class).toBe('DOG');
      expect(result.find(i => i.id === 3).menu_class).toBe('PUZZLE');
      expect(result.find(i => i.id === 4).menu_class).toBe('PLOWHORSE');
    });
  });
});
