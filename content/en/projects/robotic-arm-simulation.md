## Technical implementation
The Python simulation renders a four-revolute-joint arm with Open3D. Forward kinematics composes homogeneous transforms. The inverse-kinematics module solves for joint angles numerically given the requested end-effector pose and orientation constraint.

## Demonstration
The repository contains the simulator, solver, configuration and usage notes. The accompanying image is a rendering from the project.
