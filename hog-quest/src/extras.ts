// Fixed extra spots per room layout (rooms.ts keeps its layouts; these only use existing floor or
// furniture cells and never block a door or the row-7 corridor):
//   vend   a vending machine (rooms 2+), placed on a floor cell against the top wall
//   door   a cracked wall cell on row 1: the hidden door to the miniboss (first room only)
//   secret a piece of furniture hiding something; `from` is where you stand to inspect it
//   save   a save star on the floor: a checkpoint
import { Spot } from './rooms';

export interface Secret { spot: Spot; text: string; gold?: number; item?: string }
export interface Extras { vend: Spot; door: Spot; secret: Secret; save: Spot }

export const EXTRAS: Record<string, Extras> = {
  lobby: {
    vend: { col: 20, row: 2 }, door: { col: 14, row: 1 }, save: { col: 6, row: 5 },
    secret: { spot: { col: 1, row: 11 }, text: 'Behind the plant: a lost visitor badge, with 15 G stuck to it.', gold: 15 },
  },
  open_office: {
    vend: { col: 16, row: 2 }, door: { col: 14, row: 1 }, save: { col: 11, row: 6 },
    secret: { spot: { col: 25, row: 12 }, text: 'Behind the manuals on the shelf: a Cold Brew. Still cold.', item: 'coldbrew' },
  },
  server_room: {
    vend: { col: 15, row: 2 }, door: { col: 12, row: 1 }, save: { col: 17, row: 6 },
    secret: { spot: { col: 12, row: 3 }, text: "A note taped to the rack says 'do not unplug'. Under it: 15 G.", gold: 15 },
  },
  meeting_room: {
    vend: { col: 21, row: 2 }, door: { col: 9, row: 1 }, save: { col: 8, row: 8 },
    secret: { spot: { col: 5, row: 1 }, text: "Tiny writing under DO NOT ERASE: 'hi hedgehog'. Someone left a Hog Hoodie here.", item: 'hoodie' },
  },
  kitchen: {
    vend: { col: 20, row: 2 }, door: { col: 14, row: 1 }, save: { col: 10, row: 8 },
    secret: { spot: { col: 8, row: 2 }, text: 'The coffee machine gurgles and drops a coin. Then another. 15 G.', gold: 15 },
  },
};

export const extrasFor = (layout: string) => EXTRAS[layout] ?? EXTRAS.lobby;
