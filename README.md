# Echofront

A ricochet arena shooter for phones and desktops. Bullets get stronger every time they bounce, your Echo replays your last three seconds of movement and fire, and gravity wells bend shots around cover.

- 8 modes: Rift Survival, Bot Brawl, Squad Clash, Bank Shot, Glass Cannon, Gold Rush, Rift Hold, Boss Rush
- Solo against bots or online with friends (rooms, invites, quick match)
- Friends list with live status: online, in a match, away, offline, and when they last hit Terminate
- Coins, levels, ranks, daily drops, missions, achievements and Rift Caches
- 8 weapons, 5 abilities, 4 core upgrades and 8 ship cores, all drawn in code

Play: https://happypigtheuavdesigner.github.io/echofront/

Online play uses the public HiveMQ MQTT broker. Callsigns, friend codes, online status and saves pass through it, and anyone who knows the channel name can read them. No passwords or personal details are collected.
