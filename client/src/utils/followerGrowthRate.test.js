import { calculateFollowerGrowthRate } from './followerGrowthRate';

describe('calculateFollowerGrowthRate', () => {
  describe('totalNewFollowers calculation', () => {
    it('sums value fields from daily array', () => {
      const daily = [{ value: 100 }, { value: 50 }, { value: 25 }];
      const { totalNewFollowers } = calculateFollowerGrowthRate(daily, 1000);
      expect(totalNewFollowers).toBe(175);
    });

    it('supports val field as fallback', () => {
      const daily = [{ val: 80 }, { val: 20 }];
      const { totalNewFollowers } = calculateFollowerGrowthRate(daily, 1000);
      expect(totalNewFollowers).toBe(100);
    });

    it('ignores negative values', () => {
      const daily = [{ value: 100 }, { value: -20 }, { value: 50 }];
      const { totalNewFollowers } = calculateFollowerGrowthRate(daily, 1000);
      expect(totalNewFollowers).toBe(150);
    });

    it('handles string numbers in value field', () => {
      const daily = [{ value: '30' }, { value: '20' }];
      const { totalNewFollowers } = calculateFollowerGrowthRate(daily, 500);
      expect(totalNewFollowers).toBe(50);
    });

    it('returns 0 for empty array', () => {
      const { totalNewFollowers } = calculateFollowerGrowthRate([], 1000);
      expect(totalNewFollowers).toBe(0);
    });

    it('returns 0 for null input', () => {
      const { totalNewFollowers } = calculateFollowerGrowthRate(null, 1000);
      expect(totalNewFollowers).toBe(0);
    });

    it('returns 0 for undefined input', () => {
      const { totalNewFollowers } = calculateFollowerGrowthRate(undefined, 1000);
      expect(totalNewFollowers).toBe(0);
    });

    it('handles items with no value or val field (treats as 0)', () => {
      const daily = [{ value: 50 }, {}, { value: 30 }];
      const { totalNewFollowers } = calculateFollowerGrowthRate(daily, 1000);
      expect(totalNewFollowers).toBe(80);
    });
  });

  describe('growthRate calculation', () => {
    it('calculates growth rate as percentage rounded to 2 decimal places', () => {
      const daily = [{ value: 100 }];
      const { growthRate } = calculateFollowerGrowthRate(daily, 1000);
      expect(growthRate).toBe(10); // 100/1000 * 100 = 10%
    });

    it('rounds to 2 decimal places', () => {
      const daily = [{ value: 1 }];
      const { growthRate } = calculateFollowerGrowthRate(daily, 3);
      // 1/3 * 100 = 33.3333... → rounded to 33.33
      expect(growthRate).toBe(33.33);
    });

    it('returns 0 when currentFollowersCount is 0', () => {
      const daily = [{ value: 100 }];
      const { growthRate } = calculateFollowerGrowthRate(daily, 0);
      expect(growthRate).toBe(0);
    });

    it('returns 0 when currentFollowersCount is negative', () => {
      const daily = [{ value: 100 }];
      const { growthRate } = calculateFollowerGrowthRate(daily, -500);
      expect(growthRate).toBe(0);
    });

    it('returns 0 when totalNewFollowers is 0', () => {
      const daily = [];
      const { growthRate } = calculateFollowerGrowthRate(daily, 1000);
      expect(growthRate).toBe(0);
    });

    it('handles string currentFollowersCount', () => {
      const daily = [{ value: 50 }];
      const { growthRate } = calculateFollowerGrowthRate(daily, '1000');
      expect(growthRate).toBe(5); // 50/1000 * 100 = 5%
    });

    it('returns 0 when currentFollowersCount is NaN', () => {
      const daily = [{ value: 100 }];
      const { growthRate } = calculateFollowerGrowthRate(daily, NaN);
      expect(growthRate).toBe(0);
    });

    it('calculates correctly for large follower counts', () => {
      const daily = [{ value: 500 }, { value: 300 }];
      const { growthRate } = calculateFollowerGrowthRate(daily, 80000);
      expect(growthRate).toBe(1); // 800/80000 * 100 = 1%
    });
  });

  describe('return shape', () => {
    it('always returns both totalNewFollowers and growthRate', () => {
      const result = calculateFollowerGrowthRate([{ value: 100 }], 1000);
      expect(result).toHaveProperty('totalNewFollowers');
      expect(result).toHaveProperty('growthRate');
    });

    it('both fields are numbers', () => {
      const result = calculateFollowerGrowthRate([{ value: 100 }], 1000);
      expect(typeof result.totalNewFollowers).toBe('number');
      expect(typeof result.growthRate).toBe('number');
    });
  });
});
