import { narrate } from './narrator';

// Scoring module — tracks run statistics and computes a live score.
// Formula per GAME_SPEC: distance + style bonuses - tyre/goat penalties.

const MILESTONES = [500, 1000, 2500, 5000, 10000];

export class Scoring {
  private distanceM = 0;
  private tyreBursts = 0;
  private goatsHit = 0;
  private dogChases = 0;
  private nearMisses = 0;
  private swerves = 0;
  private milestoneIdx = 0;

  addDistance(m: number): void {
    this.distanceM += m;
    this.checkMilestone();
  }

  recordTyreBurst(): void { this.tyreBursts++; }

  recordGoatHit(): void { this.goatsHit++; }

  recordDogChase(): void { this.dogChases++; }

  recordNearMiss(): void { this.nearMisses++; }

  recordSwerve(): void { this.swerves++; }

  get score(): number {
    const distPts = Math.floor(this.distanceM / 10);
    const tyrePenalty = this.tyreBursts * 50;
    const goatPenalty = this.goatsHit * 100;
    const dogBonus = this.dogChases * 15;
    const nearMissBonus = this.nearMisses * 25;
    const swerveBonus = Math.min(this.swerves, 30) * 5; // capped style bonus
    return Math.max(0, distPts - tyrePenalty - goatPenalty + dogBonus + nearMissBonus + swerveBonus);
  }

  get stats() {
    return {
      distKm: +(this.distanceM / 1000).toFixed(2),
      tyreBursts: this.tyreBursts,
      goatsHit: this.goatsHit,
      dogChases: this.dogChases,
      nearMisses: this.nearMisses,
      swerves: this.swerves,
    };
  }

  private checkMilestone(): void {
    if (this.milestoneIdx >= MILESTONES.length) return;
    if (this.score >= MILESTONES[this.milestoneIdx]) {
      this.milestoneIdx++;
      narrate('score.milestone');
    }
  }
}
