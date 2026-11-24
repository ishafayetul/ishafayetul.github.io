## Simulation workspace

The workspace uses ROS 2 Humble to organize the arm description, simulated hardware and joint controllers. Separate packages contain the Gazebo configuration, ros2_control configuration and MoveIt planning setup.

## Technical implementation

The repository includes joint limits, a kinematics configuration and a C++ MoveIt interface. It also defines a ROS 2 action for sending arm tasks.
