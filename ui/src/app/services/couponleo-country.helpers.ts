export function normalizeCountryRouteValue(value: string | null | undefined): string {
  const normalizedValue = value?.trim();
  return normalizedValue ? normalizedValue : 'all';
}

export function locationFilterForCountry(country: string): string | undefined {
  const normalizedCountry = normalizeCountryRouteValue(country);
  return normalizedCountry === 'all' ? undefined : normalizedCountry;
}
