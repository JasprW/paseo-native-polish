Native Polish adds motion to Paseo's desktop and web client: sidebar expansion and collapse, tab opening and closing, pane splitting, closing and maximize/restore, menus and dialogs, button feedback, file tree arrows, tool call and thinking details, agent status changes and new messages. It uses the existing Paseo views, including specialized tool output and grouped tools.

Desktop focus polish subtly changes the active pane header background and softens toolbar icons and selections when the app window is inactive. Buttons use an arrow cursor on pointer devices; links keep their hand cursor and resize handles keep their resize cursor. These treatments follow the current theme and have a separate Desktop feel switch.

Requires Paseo 0.11.2. The desktop and web adapter depends on that version's internal view structure, so later minor versions require a compatibility review. iOS and Android keep their existing motion.

Open Native Polish in the sidebar to enable or disable each category and choose a gentle 220 ms or quick 150 ms pace. Button and status feedback uses shorter transitions. New messages fade in once near the bottom of the conversation; streaming text and loaded history stay stable. System Reduce Motion turns off the added animations. Preferences are stored in this client's local storage.

The client observes layout changes and briefly copies visible content locally for exit animations. Copies cannot receive input or accessibility focus and are removed after the transition. The plugin sends no content to a service and contributes no daemon backend.
