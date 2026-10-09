import type { TFunction } from 'i18next'
import type { PlaceCategory } from './useVehicles'

/*
 * Labels and colours for the place beside a GPS stop.
 *
 * `kind` is the raw OpenStreetMap value (cafe, restaurant, hotel, …) — only
 * the handful that actually occur in the Uzbekistan extract are spelled out;
 * anything else falls back to its category, and a stop next to nothing mapped
 * is "unknown place".
 */

const KIND_KEYS = {
  cafe: 'vehicles.placeCafe',
  restaurant: 'vehicles.placeRestaurant',
  fast_food: 'vehicles.placeFastFood',
  food_court: 'vehicles.placeFoodCourt',
  bar: 'vehicles.placeBar',
  pub: 'vehicles.placeBar',
  nightclub: 'vehicles.placeNightclub',
  hookah_lounge: 'vehicles.placeHookah',
  cinema: 'vehicles.placeCinema',
  theatre: 'vehicles.placeTheatre',
  sauna: 'vehicles.placeSauna',
  water_park: 'vehicles.placeWaterPark',
  bowling_alley: 'vehicles.placeBowling',
  amusement_arcade: 'vehicles.placeArcade',
  hotel: 'vehicles.placeHotel',
  guest_house: 'vehicles.placeGuestHouse',
  hostel: 'vehicles.placeHostel',
  motel: 'vehicles.placeHotel',
  resort: 'vehicles.placeResort',
  attraction: 'vehicles.placeAttraction',
  branch: 'vehicles.placeBranch',
  location: 'vehicles.placeLocation',
} as const

const CATEGORY_KEYS = {
  food: 'vehicles.catFood',
  hotel: 'vehicles.catHotel',
  entertainment: 'vehicles.catEntertainment',
  attraction: 'vehicles.catAttraction',
  own: 'vehicles.catOwn',
} as const

export const PLACE_CATEGORIES: Exclude<PlaceCategory, 'own'>[] = ['food', 'hotel', 'entertainment', 'attraction']

export function categoryLabel(t: TFunction, category?: string | null): string {
  const key = CATEGORY_KEYS[(category ?? '') as keyof typeof CATEGORY_KEYS]
  return key ? t(key) : (category ?? '')
}

export function placeLabel(t: TFunction, kind?: string | null, category?: string | null): string {
  const key = KIND_KEYS[(kind ?? '') as keyof typeof KIND_KEYS]
  return key ? t(key) : categoryLabel(t, category)
}

/** Marker colour by category — literal because MapLibre markers live outside Tailwind. */
export function stopColor(category?: string | null): string {
  switch (category) {
    case 'food':
      return '#FF8A3D'
    case 'hotel':
      return '#C084FC'
    case 'entertainment':
      return '#F472B6'
    case 'attraction':
      return '#FACC15'
    case 'own':
      return '#10F5AF'
    default:
      return '#9CA3AF'
  }
}
