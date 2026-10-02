const http = require("http");

const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder
} = require("discord.js");

const {
  connectDatabase,
  getDatabase
} = require("./database");

const PORT = process.env.PORT || 3000;
const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

const MAX_TIMEOUT = 2147483647;

if (!TOKEN || !CLIENT_ID || !GUILD_ID) {
  throw new Error("DISCORD_TOKEN, CLIENT_ID or GUILD_ID is missing.");
}

/* =========================
   HTTP SERVER
========================= */

const server = http.createServer((req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/plain"
  });

  res.end("ItamaRos Bot is online!");
});

server.listen(PORT, () => {
  console.log(`Web server is running on port ${PORT}`);
});

/* =========================
   DISCORD CLIENT
========================= */

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

/* =========================
   DATABASE
========================= */

function getGiveawaysCollection() {
  const db = getDatabase();
  return db.collection("giveaways");
}

/* =========================
   COMMANDS
========================= */

const commands = [
  new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Check if the bot is online."),

  new SlashCommandBuilder()
    .setName("giveaway")
    .setDescription("Create a giveaway.")
    .addStringOption(option =>
      option
        .setName("prize")
        .setDescription("The giveaway prize.")
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName("duration")
        .setDescription("Duration: 1M, 5M, 1H, 6H, 1D, 7D, 1W, 3W.")
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option
        .setName("winners")
        .setDescription("Number of winners.")
        .setMinValue(1)
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("drop")
    .setDescription("Create a drop.")
    .addStringOption(option =>
      option
        .setName("prize")
        .setDescription("The drop prize.")
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("force-end")
    .setDescription("Force-end an active giveaway or drop.")
].map(command => command.toJSON());

/* =========================
   REGISTER COMMANDS
========================= */

async function registerCommands() {
  const rest = new REST({ version: "10" }).setToken(TOKEN);

  await rest.put(
    Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
    {
      body: commands
    }
  );

  console.log("Slash commands registered successfully.");
}

/* =========================
   DURATION PARSER
========================= */

function parseDuration(input) {
  const value = input.trim().toUpperCase();

  const match = value.match(/^(\d+)(M|H|D|W)$/);

  if (!match) {
    return null;
  }

  const amount = Number(match[1]);
  const unit = match[2];

  if (amount < 1) {
    return null;
  }

  const multipliers = {
    M: 60 * 1000,
    H: 60 * 60 * 1000,
    D: 24 * 60 * 60 * 1000,
    W: 7 * 24 * 60 * 60 * 1000
  };

  return amount * multipliers[unit];
}

/* =========================
   BUTTONS
========================= */

function createGiveawayButton(count) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("giveaway_enter")
      .setLabel(`🎉 Enter Giveaway (${count})`)
      .setStyle(ButtonStyle.Success)
  );
}

function createDropButton() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("drop_claim")
      .setLabel("🎉 CLAIM")
      .setStyle(ButtonStyle.Success)
  );
}

function createFinishedGiveawayButton(count) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("giveaway_finished")
      .setLabel(`🎉 Giveaway Ended (${count})`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true)
  );
}

function createFinishedDropButton() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("drop_finished")
      .setLabel("🎉 DROP ENDED")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true)
  );
}

/* =========================
   EMBEDS
========================= */

function createGiveawayEmbed({
  prize,
  hostId,
  winners,
  endsAt,
  participants
}) {
  return new EmbedBuilder()
    .setTitle("🎉 GIVEAWAY")
    .setDescription(
      `**Prize:** ${prize}\n\n` +
      `**Hosted by:** <@${hostId}>\n` +
      `**Winners:** ${winners}\n` +
      `**Participants:** ${participants}\n\n` +
      `**Ends:** <t:${Math.floor(endsAt / 1000)}:R>`
    )
    .setFooter({
      text: "Click the button below to enter!"
    });
}

function createDropEmbed({
  prize,
  hostId
}) {
  const description = prize
    ? `**Prize:** ${prize}\n\n`
    : "";

  return new EmbedBuilder()
    .setTitle("🎉 DROP")
    .setDescription(
      `${description}` +
      `**Hosted by:** <@${hostId}>\n\n` +
      `Be the first person to claim it!`
    )
    .setFooter({
      text: "First click wins!"
    });
}

function createEndedGiveawayEmbed({
  prize,
  hostId,
  participants,
  winners
}) {
  const winnerText =
    winners.length > 0
      ? winners.map(id => `<@${id}>`).join(", ")
      : "No winners";

  return new EmbedBuilder()
    .setTitle("🎉 GIVEAWAY ENDED!")
    .setDescription(
      `**Prize:** ${prize}\n\n` +
      `**Hosted by:** <@${hostId}>\n` +
      `**Participants:** ${participants}\n\n` +
      `**Winner${winners.length === 1 ? "" : "s"}:** ${winnerText}`
    );
}

function createEndedDropEmbed({
  prize,
  hostId,
  winnerId
}) {
  const description = prize
    ? `**Prize:** ${prize}\n\n`
    : "";

  return new EmbedBuilder()
    .setTitle("🎉 DROP ENDED!")
    .setDescription(
      `${description}` +
      `**Hosted by:** <@${hostId}>\n\n` +
      `**Winner:** <@${winnerId}>`
    );
}

/* =========================
   PICK WINNERS
========================= */

function pickWinners(entries, amount) {
  const shuffled = [...entries];

  for (let i = shuffled.length - 1; i > 0; i--) {
    const randomIndex = Math.floor(Math.random() * (i + 1));

    [shuffled[i], shuffled[randomIndex]] = [
      shuffled[randomIndex],
      shuffled[i]
    ];
  }

  return shuffled.slice(0, Math.min(amount, shuffled.length));
}

/* =========================
   FETCH MESSAGE
========================= */

async function fetchGiveawayMessage(giveaway) {
  try {
    const channel = await client.channels.fetch(giveaway.channelId);

    if (!channel || !channel.isTextBased()) {
      return null;
    }

    return await channel.messages.fetch(giveaway.messageId);
  } catch (error) {
    console.error(
      `Could not fetch message ${giveaway.messageId}:`,
      error.message
    );

    return null;
  }
}

/* =========================
   FINISH GIVEAWAY
========================= */

async function finishGiveaway(messageId) {
  const collection = getGiveawaysCollection();

  const giveaway = await collection.findOne({
    messageId,
    type: "giveaway",
    finished: false
  });

  if (!giveaway) {
    return false;
  }

  const participants = giveaway.entries || [];

  const winners = pickWinners(
    participants,
    giveaway.winnerCount
  );

  const updateResult = await collection.updateOne(
    {
      _id: giveaway._id,
      finished: false
    },
    {
      $set: {
        finished: true,
        winnerIds: winners,
        endedAt: Date.now()
      }
    }
  );

  if (updateResult.modifiedCount !== 1) {
    return false;
  }

  const message = await fetchGiveawayMessage(giveaway);

  if (message) {
    await message.edit({
      embeds: [
        createEndedGiveawayEmbed({
          prize: giveaway.prize,
          hostId: giveaway.hostId,
          participants: participants.length,
          winners
        })
      ],
      components: [
        createFinishedGiveawayButton(participants.length)
      ]
    });
  }

  console.log(
    `Giveaway ${messageId} ended. Winners: ${winners.join(", ") || "none"}`
  );

  return true;
}

/* =========================
   CLAIM DROP
========================= */

async function claimDrop(messageId, userId) {
  const collection = getGiveawaysCollection();

  const result = await collection.findOneAndUpdate(
    {
      messageId,
      type: "drop",
      finished: false
    },
    {
      $set: {
        finished: true,
        winnerId: userId,
        endedAt: Date.now()
      }
    },
    {
      returnDocument: "after"
    }
  );

  const drop = result.value;

  if (!drop) {
    return null;
  }

  const message = await fetchGiveawayMessage(drop);

  if (message) {
    await message.edit({
      embeds: [
        createEndedDropEmbed({
          prize: drop.prize,
          hostId: drop.hostId,
          winnerId: userId
        })
      ],
      components: [
        createFinishedDropButton()
      ]
    });
  }

  console.log(
    `Drop ${messageId} claimed by ${userId}.`
  );

  return drop;
}

/* =========================
   SCHEDULE GIVEAWAY
========================= */

function scheduleGiveaway(giveaway) {
  if (giveaway.finished) {
    return;
  }

  const remaining =
    giveaway.endsAt - Date.now();

  if (remaining <= 0) {
    finishGiveaway(giveaway.messageId).catch(error => {
      console.error("Failed to finish giveaway:", error);
    });

    return;
  }

  const timeout = Math.min(
    remaining,
    MAX_TIMEOUT
  );

  setTimeout(() => {
    if (remaining > MAX_TIMEOUT) {
      scheduleGiveaway(giveaway);
    } else {
      finishGiveaway(giveaway.messageId).catch(error => {
        console.error("Failed to finish giveaway:", error);
      });
    }
  }, timeout);
}

/* =========================
   CREATE GIVEAWAY
========================= */

async function createGiveaway(interaction) {
  const prize =
    interaction.options.getString("prize", true);

  const durationInput =
    interaction.options.getString("duration", true);

  const winnerCount =
    interaction.options.getInteger("winners", true);

  const duration =
    parseDuration(durationInput);

  if (!duration) {
    await interaction.reply({
      content:
        "Invalid duration. Use formats like `1M`, `5M`, `1H`, `6H`, `1D`, `7D`, or `1W`.",
      ephemeral: true
    });

    return;
  }

  const endsAt = Date.now() + duration;

  const message = await interaction.reply({
    embeds: [
      createGiveawayEmbed({
        prize,
        hostId: interaction.user.id,
        winners: winnerCount,
        endsAt,
        participants: 0
      })
    ],
    components: [
      createGiveawayButton(0)
    ],
    fetchReply: true
  });

  const collection = getGiveawaysCollection();

  const giveaway = {
    type: "giveaway",
    guildId: interaction.guildId,
    channelId: interaction.channelId,
    messageId: message.id,
    prize,
    hostId: interaction.user.id,
    winnerCount,
    entries: [],
    endsAt,
    finished: false,
    createdAt: Date.now()
  };

  await collection.insertOne(giveaway);

  scheduleGiveaway(giveaway);
}

/* =========================
   CREATE DROP
========================= */

async function createDrop(interaction) {
  const prize =
    interaction.options.getString("prize");

  const message = await interaction.reply({
    embeds: [
      createDropEmbed({
        prize,
        hostId: interaction.user.id
      })
    ],
    components: [
      createDropButton()
    ],
    fetchReply: true
  });

  const collection = getGiveawaysCollection();

  await collection.insertOne({
    type: "drop",
    guildId: interaction.guildId,
    channelId: interaction.channelId,
    messageId: message.id,
    prize: prize || null,
    hostId: interaction.user.id,
    finished: false,
    createdAt: Date.now()
  });
}

/* =========================
   FORCE END MENU
========================= */

async function showForceEndMenu(interaction) {
  const collection = getGiveawaysCollection();

  const activeItems = await collection
    .find({
      guildId: interaction.guildId,
      finished: false
    })
    .sort({
      createdAt: -1
    })
    .limit(25)
    .toArray();

  if (activeItems.length === 0) {
    await interaction.reply({
      content: "There are no active giveaways or drops.",
      ephemeral: true
    });

    return;
  }

  const options = activeItems.map(item => {
    const type =
      item.type === "giveaway"
        ? "🎉 Giveaway"
        : "💥 Drop";

    const prize =
      item.prize || "No prize";

    return {
      label: `${type}: ${prize}`.slice(0, 100),
      description:
        item.type === "giveaway"
          ? `${item.entries?.length || 0} participants`
          : "First person to claim wins",
      value: item.messageId
    };
  });

  const menu = new StringSelectMenuBuilder()
    .setCustomId("force_end_select")
    .setPlaceholder("Choose an active giveaway or drop")
    .addOptions(options);

  const row = new ActionRowBuilder().addComponents(menu);

  await interaction.reply({
    content:
      "Choose the active giveaway or drop you want to end:",
    components: [row],
    ephemeral: true
  });
}

/* =========================
   FORCE END
========================= */

async function forceEnd(interaction, messageId) {
  const collection = getGiveawaysCollection();

  const item = await collection.findOne({
    guildId: interaction.guildId,
    messageId,
    finished: false
  });

  if (!item) {
    await interaction.update({
      content:
        "That giveaway or drop is no longer active.",
      components: []
    });

    return;
  }

  if (item.type === "giveaway") {
    const ended = await finishGiveaway(
      item.messageId
    );

    await interaction.update({
      content: ended
        ? "The giveaway has been force-ended successfully."
        : "The giveaway could not be ended.",
      components: []
    });

    return;
  }

  if (item.type === "drop") {
    const participants = [];

    const updateResult = await collection.updateOne(
      {
        _id: item._id,
        finished: false
      },
      {
        $set: {
          finished: true,
          winnerId: null,
          endedAt: Date.now(),
          forceEnded: true
        }
      }
    );

    if (updateResult.modifiedCount !== 1) {
      await interaction.update({
        content:
          "The drop could not be ended.",
        components: []
      });

      return;
    }

    const message =
      await fetchGiveawayMessage(item);

    if (message) {
      const description = item.prize
        ? `**Prize:** ${item.prize}\n\n`
        : "";

      await message.edit({
        embeds: [
          new EmbedBuilder()
            .setTitle("🎉 DROP ENDED!")
            .setDescription(
              `${description}` +
              `**Hosted by:** <@${item.hostId}>\n\n` +
              `**Winner:** No winner — the drop was force-ended.`
            )
        ],
        components: [
          createFinishedDropButton()
        ]
      });
    }

    await interaction.update({
      content:
        "The drop has been force-ended successfully. No winner was selected.",
      components: []
    });
  }
}

/* =========================
   RESTORE ACTIVE GIVEAWAYS
========================= */

async function restoreActiveGiveaways() {
  const collection = getGiveawaysCollection();

  const activeGiveaways = await collection
    .find({
      type: "giveaway",
      finished: false
    })
    .toArray();

  for (const giveaway of activeGiveaways) {
    scheduleGiveaway(giveaway);
  }

  console.log(
    `Restored ${activeGiveaways.length} active giveaway(s).`
  );
}

/* =========================
   BOT READY
========================= */

client.once("clientReady", async () => {
  console.log(
    `ItamaRos Bot is online as ${client.user.tag}`
  );

  try {
    await connectDatabase();

    await registerCommands();

    await restoreActiveGiveaways();

    console.log("Bot startup completed successfully.");
  } catch (error) {
    console.error("Startup error:", error);
  }
});

/* =========================
   INTERACTIONS
========================= */

client.on("interactionCreate", async interaction => {
  try {
    /* ---------- SLASH COMMANDS ---------- */

    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === "ping") {
        await interaction.reply({
          content: "Pong! 🏓",
          ephemeral: true
        });

        return;
      }

      if (
        interaction.commandName === "giveaway" ||
        interaction.commandName === "drop" ||
        interaction.commandName === "force-end"
      ) {
        const isAdmin =
          interaction.memberPermissions?.has(
            PermissionFlagsBits.ManageGuild
          );

        if (!isAdmin) {
          await interaction.reply({
            content:
              "You need the Manage Server permission to use this command.",
            ephemeral: true
          });

          return;
        }
      }

      if (interaction.commandName === "giveaway") {
        await createGiveaway(interaction);
        return;
      }

      if (interaction.commandName === "drop") {
        await createDrop(interaction);
        return;
      }

      if (interaction.commandName === "force-end") {
        await showForceEndMenu(interaction);
        return;
      }
    }

    /* ---------- GIVEAWAY BUTTON ---------- */

    if (
      interaction.isButton() &&
      interaction.customId === "giveaway_enter"
    ) {
      const collection = getGiveawaysCollection();

      const result = await collection.findOneAndUpdate(
        {
          messageId: interaction.message.id,
          type: "giveaway",
          finished: false,
          entries: {
            $ne: interaction.user.id
          }
        },
        {
          $addToSet: {
            entries: interaction.user.id
          }
        },
        {
          returnDocument: "after"
        }
      );

      const giveaway = result.value;

      if (!giveaway) {
        const alreadyEntered =
          await collection.findOne({
            messageId: interaction.message.id,
            type: "giveaway",
            finished: false,
            entries: interaction.user.id
          });

        if (alreadyEntered) {
          await interaction.reply({
            content:
              "You are already entered in this giveaway!",
            ephemeral: true
          });
        } else {
          await interaction.reply({
            content:
              "This giveaway is no longer active.",
            ephemeral: true
          });
        }

        return;
      }

      const count =
        giveaway.entries.length;

      await interaction.message.edit({
        components: [
          createGiveawayButton(count)
        ]
      });

      await interaction.reply({
        content:
          "You have entered the giveaway! 🎉",
        ephemeral: true
      });

      return;
    }

    /* ---------- DROP BUTTON ---------- */

    if (
      interaction.isButton() &&
      interaction.customId === "drop_claim"
    ) {
      const drop = await claimDrop(
        interaction.message.id,
        interaction.user.id
      );

      if (!drop) {
        await interaction.reply({
          content:
            "Too late! This drop has already been claimed or ended.",
          ephemeral: true
        });

        return;
      }

      await interaction.reply({
        content:
          "You won the drop! 🎉",
        ephemeral: true
      });

      return;
    }

    /* ---------- FORCE END SELECT MENU ---------- */

    if (
      interaction.isStringSelectMenu() &&
      interaction.customId === "force_end_select"
    ) {
      const messageId =
        interaction.values[0];

      await forceEnd(
        interaction,
        messageId
      );

      return;
    }
  } catch (error) {
    console.error(
      "Interaction error:",
      error
    );

    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({
        content:
          "Something went wrong while processing this interaction.",
        ephemeral: true
      }).catch(() => {});
    } else {
      await interaction.reply({
        content:
          "Something went wrong while processing this interaction.",
        ephemeral: true
      }).catch(() => {});
    }
  }
});

/* =========================
   LOGIN
========================= */

client.login(TOKEN).catch(error => {
  console.error(
    "Discord login failed:",
    error
  );
});
