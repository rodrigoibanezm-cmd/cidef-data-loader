const finite = (value) => Number.isFinite(value);

export function mean(values = []) {
  const nums = values.filter(finite);
  if (!nums.length) return null;
  return nums.reduce((sum, value) => sum + value, 0) / nums.length;
}

export function median(values = []) {
  const nums = values.filter(finite).sort((a, b) => a - b);
  if (!nums.length) return null;
  const mid = Math.floor(nums.length / 2);
  return nums.length % 2 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2;
}

export function populationStddev(values = []) {
  const nums = values.filter(finite);
  if (!nums.length) return null;
  const avg = mean(nums);
  const variance = nums.reduce((sum, value) => sum + ((value - avg) ** 2), 0) / nums.length;
  return Math.sqrt(variance);
}

export function summarizeNumbers(values = []) {
  const nums = values.filter(finite);
  return {
    months: nums.length,
    mean: mean(nums),
    median: median(nums),
    stddevPopulation: populationStddev(nums),
    min: nums.length ? Math.min(...nums) : null,
    max: nums.length ? Math.max(...nums) : null,
  };
}
