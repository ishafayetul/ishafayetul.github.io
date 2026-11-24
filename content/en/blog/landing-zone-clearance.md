## Start from a hazard mask
A semantic segmentation model can produce a mask of terrain classes. Define which classes count as hazards for the mission. Retain uncertainty near class boundaries when evaluating candidates.

## Use clearance to score candidates
An Euclidean distance transform assigns each eligible cell a distance to the nearest hazard. Local maxima give candidate centers. Scoring can also account for region size, uncertainty and the vehicle footprint.

## Keep units explicit
Distances in image pixels do not directly give ground distances. Camera calibration and an appropriate mapping from image coordinates to the ground are needed before applying a vehicle clearance requirement stated in meters.
