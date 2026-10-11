Native Polish adds motion to Paseo's desktop and web client: sidebar expansion and collapse, tab opening and closing, pane splitting, closing and maximize/restore, menus and dialogs, button feedback, file tree arrows, tool call and thinking details, agent status changes and new messages. It uses the existing Paseo views, including specialized tool output and grouped tools.

Requires Paseo 0.11.2. The desktop and web adapter depends on that version's internal view structure, so later minor versions require a compatibility review. iOS and Android keep their existing motion.

Workspace rows fade in when created and fade out when archived. Neighboring rows move into place. This uses the sidebar motion setting and works in project and status grouping.

Open Native Polish in the sidebar to enable or disable each category and choose a gentle 220 ms or quick 150 ms pace. Button and status feedback uses shorter transitions. New messages fade in once near the bottom of the conversation; streaming text and loaded history stay stable. System Reduce Motion turns off the added animations. Preferences are stored in this client's local storage.

The client observes layout changes and briefly copies visible content locally for exit animations. Copies cannot receive input or accessibility focus and are removed after the transition. The plugin sends no content to a service and contributes no daemon backend.
