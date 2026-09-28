import { narrate } from './narrator';

// Scoring (GAME_SPEC V1): distance driven, near-misses (potholes dodged at speed),
// style swerves, tyres burst (penalty), goats hit (penalty), goats spared (bonus).
//
// All values are intentionally readable integers — displayed on the end screen.
//
// Public API:
//   score.addDistance(meters)      — call each frame with distance covered
//   score.recordPotholeDodge()     — called by potholes when car passes close but doesn't burst
//   score.recordStyleSwerve()      — called by input/car when the car makes a sharp avoidance swerve
//   score.recordTyreBurst()        — called by potholes on burst
//   score.recordGoatHit()          — called by goats on hit
//   score.summary()                — returns final breakdown object (call on route completion)

const PTS_PER_KM = 100;
const PTS_NEAR_MISS = 50;
const PTS_STYLE_SWERVE = 25;
const PTS_TYRE_BURST = -150;
const PTS_GOAT_HIT = -200;
const PTS_GOAT_SPARED_BONUS = 75;   // awarded at summary for each herd crossed without a hit

export interface ScoreSummary {
  total: number;
  distanceKm: number;
  distancePts: number;
  nearMisses: number;
  nearMissPts: number;
  styleSwerves: number;
  stylePts: number;
  tyreBursts: number;
  tyrePts: number;
  goatHits: number;
  goatPts: number;
  goatHerdsCrossed: number;
  goatSparedBonus: number;
}

export class Score {
  private distanceM = 0;
  private nearMisses = 0;
  private styleSwerves = 0;
  private tyreBursts = 0;
  private _goatHits = 0;
  private goatHerdsCrossed = 0;

  // Milestone flags — narrator fires once per milestone
  private milestone50fired = false;

  addDistance(meters: number): void {
    this.distanceM += meters;
    const km = this.distanceM / 1000;
    // Halfway milestone: route is ~36 km compressed
    if (!this.milestone50fired && km >= 18) {
      this.milestone50fired = true;
      narrate('score.milestone.halfway');
    }
  }

  recordPotholeDodge(): void {
    this.nearMisses++;
  }

  recordStyleSwerve(): void {
    this.styleSwerves++;
  }

  recordTyreBurst(): void {
    this.tyreBursts++;
  }

  recordGoatHit(): void {
    this._goatHits++;
  }

  recordGoatHerdCrossed(withHit: boolean): void {
    this.goatHerdsCrossed++;
    if (!withHit) narrate('score.goats.spared');
  }

  get goatHits(): number {
    return this._goatHits;
  }

  summary(): ScoreSummary {
    const distancePts = Math.round((this.distanceM / 1000) * PTS_PER_KM);
    const nearMissPts = this.nearMisses * PTS_NEAR_MISS;
    const stylePts = this.styleSwerves * PTS_STYLE_SWERVE;
    const tyrePts = this.tyreBursts * PTS_TYRE_BURST;
    const goatPts = this._goatHits * PTS_GOAT_HIT;
    const goatSparedCount = Math.max(0, this.goatHerdsCrossed - this._goatHits);
    const goatSparedBonus = goatSparedCount * PTS_GOAT_SPARED_BONUS;

    return {
      total: distancePts + nearMissPts + stylePts + tyrePts + goatPts + goatSparedBonus,
      distanceKm: Math.round((this.distanceM / 1000) * 10) / 10,
      distancePts,
      nearMisses: this.nearMisses,
      nearMissPts,
      styleSwerves: this.styleSwerves,
      stylePts,
      tyreBursts: this.tyreBursts,
      tyrePts,
      goatHits: this._goatHits,
      goatPts,
      goatHerdsCrossed: this.goatHerdsCrossed,
      goatSparedBonus,
    };
  }
}
