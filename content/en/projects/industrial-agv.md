## Project overview
This industrial AGV project at Unipolar Automation Technology combined a ROS navigation stack with a mobile base and simulation models.

## Engineering problem
An AGV needs a consistent position estimate before its planner can follow a route around obstacles. Mapping, localization, local planning and sensor fusion need to behave as a system across simulation and hardware.

## My contributions
I developed the AGV and simulation models, implemented ROS navigation with SLAM, AMCL and the TEB local planner, and fused sensor data through an extended Kalman filter. I used Fusion 360 for design and Gazebo and RViz for simulation and inspection.

## Technical implementation
SLAM builds the map. AMCL estimates the robot pose in the mapped environment, and TEB handles local trajectory planning. The linked ROS 1 repository documents hardware bring-up, RPLIDAR integration, serial communication and EKF dependencies.
