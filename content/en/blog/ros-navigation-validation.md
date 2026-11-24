## Define a run before measuring it
Record the map, initial pose, goal tolerance and obstacle setup. A success percentage is meaningful only when the denominator and the success criteria travel with it. Log aborted and timed-out runs with the same care as successful runs.

## Check the sources of error
Compare timestamps and transforms before tuning planners. Inspect odometry drift, the scan alignment against the map and the localization estimate as separate observations. If possible, use an independent reference for localization error.

## Reproduce a failure
Save a ROS bag of the sensor data and the relevant parameter files. Replay the data to isolate changes in mapping and localization. Repeat on hardware after candidate changes pass simulation, because timing and wheel slip can change the result.
