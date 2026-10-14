// A linked outdoor area (a garden) opens like a room: same chip, same panel, same devices.

import { areaEntities, isPlaceable, kindOf, primaryEntities } from "./devices.ts";
import type { Building, Floor, OutdoorArea, Room } from "./model.ts";
import type { HomeAssistant } from "./types.ts";

/** Placeable main entities of an area (one per device). */
export function outdoorDeviceIds(hass: HomeAssistant, areaId: string | null): string[] {
  return primaryEntities(hass, areaEntities(hass, areaId)).filter((id) => isPlaceable(kindOf(id)));
}

/** The name drawn on an outdoor area: its own name, else the linked Home Assistant area. */
export function outdoorLabel(hass: HomeAssistant | undefined, area: OutdoorArea): string {
  return area.name?.trim() || (area.area_id && hass?.areas?.[area.area_id]?.name) || "";
}

/** Outdoor areas on a floor that stand for a Home Assistant area. */
export function linkedOutdoor(floor: Floor): OutdoorArea[] {
  return (floor.outdoor ?? []).filter((a) => !!a.area_id && a.points.length >= 3);
}

/** A room-shaped view of a linked outdoor area, so the room panel can list its devices. */
export function outdoorRoom(hass: HomeAssistant, area: OutdoorArea): Room | null {
  if (!area.area_id || area.points.length < 3) return null;
  return {
    id: area.id,
    name: outdoorLabel(hass, area) || area.area_id,
    area_id: area.area_id,
    points: area.points,
    floor_material: "stone",
    panel: outdoorDeviceIds(hass, area.area_id),
  };
}

/** The room, or linked outdoor area, behind a chip or a tap. */
export function planTarget(building: Building, hass: HomeAssistant, id: string | null): { floor: Floor; room: Room } | null {
  if (!id) return null;
  for (const floor of building.floors) {
    const room = floor.rooms.find((r) => r.id === id);
    if (room) return { floor, room };
    const area = (floor.outdoor ?? []).find((a) => a.id === id);
    const asRoom = area ? outdoorRoom(hass, area) : null;
    if (asRoom) return { floor, room: asRoom };
  }
  return null;
}
