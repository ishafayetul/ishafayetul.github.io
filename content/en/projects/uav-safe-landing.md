## Research question
How can a UAV rank visually suitable landing areas while accounting for distance from detected hazards?

## Technical implementation
The research demo runs SegFormer-B0 on overlapping tiles from an RGB aerial image. Semantic classes and model confidence inform a hazard-aware risk map. A distance transform measures clearance from excluded regions, and circular footprint validation identifies candidate centers where the configured footprint fits. Connected candidate regions are then ranked and exported with supporting visualizations and run metadata.

## Saved evaluation example
The recorded run used image `525.jpg`, 512 px tiles with a 96 px overlap, and a configured landing footprint radius of 300 px. It ran on a CPU and returned one valid region. Its center and clearance are measured in the source image. This single run characterizes the example. Broader model accuracy and physical flight safety require separate evaluation.

[Read the saved run documentation](https://github.com/ishafayetul/safe-landing-zone-detection/blob/main/deliverables/research_packet/RESULT_SUMMARY.md)
