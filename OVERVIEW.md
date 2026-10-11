Native Polish adds motion to Paseo's desktop and web client: sidebar expansion and collapse, tab opening and closing, pane splitting, closing and maximize/restore, menus and dialogs, button feedback, file tree arrows, tool call and thinking details, agent status changes and new messages. It uses the existing Paseo views, including specialized tool output and grouped tools.

Requires Paseo 0.11.2. The desktop and web adapter depends on that version's internal view structure, so later minor versions require a compatibility review. iOS and Android keep their existing motion.

Workspace rows fade in when created and fade out when archived. Pinning, unpinning and status-group changes move the existing row smoothly. Project creation/removal animates the group and neighboring rows moving into place. This uses the sidebar motion setting and works in project and status grouping.

Elastic scrolling adds a small damped rebound at the top and bottom of agent conversations, workspace lists, Files and Changes. It has a separate switch and responds to vertical wheel/trackpad and single-finger web touch input. Normal scrolling, horizontal gestures, pinch zoom and nested code/detail scrollers keep their behavior. Native clients retain their existing scrolling.

Supported macOS/iOS browsers use the platform rebound. The desktop fallback follows input directly and returns quickly after release; it approximates the effect because Paseo's Electron window does not expose native scroll bounce to a client plugin.

Open Native Polish in the sidebar to enable or disable each category and choose a gentle 220 ms or quick 150 ms pace. Button and status feedback uses shorter transitions. New messages fade in once near the bottom of the conversation; streaming text and loaded history stay stable. System Reduce Motion turns off the added animations. Preferences are stored in this client's local storage.

The client observes layout changes and briefly copies visible content locally for exit animations. Copies cannot receive input or accessibility focus and are removed after the transition. The plugin sends no content to a service and contributes no daemon backend.

An experimental native context menu switch requires the accompanying macOS Native Menu Preview host. It applies to workspace and file right-click menus; standard Paseo keeps its existing menus. Custom interactive pages continue using Paseo’s interface.
