# Custom Repository & Agent Rules

All agents working on `smarter-home-pi` must strictly adhere to the following rules:

### 1. Latest Commit Log Rule (`latest.commit.txt`)
- **Rule**: Whenever any changes, new files, or modifications are made to the repository, the agent **must** update [latest.commit.txt](file:///c:/Documents/Development/Repositories/smarter-home-pi/latest.commit.txt) in the repository root directory based on the uncommitted files and current diffs.
- **Format**: The file must be properly formatted for direct use with `git commit -F latest.commit.txt`:
  - A clear, conventional commit subject line (e.g. `feat(controller): ...`, `fix(sensors): ...`).
  - Followed by a blank line.
  - Followed by a detailed bulleted list of changes and components touched.

### 2. File Length & Splitting Rule
- **Rule**: All source code files must be kept concise. If any file exceeds 500 lines of code, it **must** be split into modular files, sub-drivers, or smaller components.

### 3. Hardware Abstraction & Emulation Rule
- **Rule**: All hardware integrations (GPIO, 1-wire, Camera V4L2) must provide graceful software fallback / simulation modes so development and testing can proceed seamlessly on non-Raspberry Pi environments.

### 4. Type Safety & Build Verification
- **Rule**: Every change must be validated with `npm run build` (`tsc`) to ensure 100% type safety and zero compilation errors before concluding any task.
