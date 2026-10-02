const http = require("http");

const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder
} = require("discord.js");

const {
  connectDatabase,
  getDatabase
} = require("./database");

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

if (!TOKEN || !CLIENT_ID || !GUILD_ID) {
  throw new Error(
    "DISCORD_TOKEN, CLIENT_ID or GUILD_ID is missing."
  );
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

server.listen(
  process.env.PORT || 3000,
  () => {
    console.log(
      `Web server is running on port ${process.env.PORT || 3000}`
    );
  }
);

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

function getCollection() {
  return getDatabase().collection("giveaways");
}

/* =========================
   SLASH COMMANDS
========================= */

const commands = [
  new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Check if the bot is online."),

  new SlashCommandBuilder()
    .setName("giveaway")
    .setDescription("Start a giveaway.")
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageGuild.toString()
    )
    .addStringOption(option =>
      option
        .setName("prize")
        .setDescription("The giveaway prize.")
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName("duration")
        .setDescription(
          "Examples: 1M, 5M, 1H, 6H, 1D, 7D, 1W, 3W"
        )
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option
        .setName("winners")
        .setDescription("Number of winners.")
        .setRequired(true)
        .setMinValue(1)
    ),

  new SlashCommandBuilder()
    .setName("drop")
    .setDescription("Start a first-click drop.")
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageGuild.toString()
    )
    .addStringOption(option =>
      option
        .setName("prize")
        .setDescription("The drop prize.")
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("force-end")
    .setDescription("Force-end an active giveaway or drop.")
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageGuild.toString()
    )
];

/* =========================
   COMMAND REGISTRATION
========================= */

async function registerCommands() {
  const rest = new REST({
    version: "10"
  }).setToken(TOKEN);

  await rest.put(
    Routes.applicationGuildCommands(
      CLIENT_ID,
      GUILD_ID
    ),
    {
      body: commands
    }
  );

  // Clear old global commands.
  await rest.put(
    Routes.applicationCommands(CLIENT_ID),
    {
      body: []
    }
  );

  console.log(
    "Slash commands registered successfully:"
  );

  console.log(
    commands
      .map(command => command.name)
      .join(", ")
  );
}

/* =========================
   DURATION
========================= */

function parseDuration(duration) {
  const match = /^(\d+)(M|H|D|W)$/i.exec(
    duration.trim()
  );

  if (!match) {
    return null;
  }

  const amount = Number(match[1]);
  const unit = match[2].toUpperCase();

  if (amount < 1) {
    return null;
  }

  const units = {
    M: 60 * 1000,
    H: 60 * 60 * 1000,
    D: 24 * 60 * 60 * 1000,
    W: 7 * 24 * 60 * 60 * 1000
  };

  return amount * units[unit];
}

/* =========================
   BUTTONS
========================= */

function createGiveawayButton(messageId, count, disabled = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`giveaway_${messageId}`)
      .setLabel(`🎉 ${count}`)
      .setStyle(ButtonStyle.Success)
      .setDisabled(disabled)
  );
}

function createDropButton(messageId, disabled = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`drop_${messageId}`)
      .setLabel("🎉 CLAIM")
      .setStyle(ButtonStyle.Success)
      .setDisabled(disabled)
  );
}

/* =========================
   WINNER SELECTION
========================= */

function pickWinners(entries, amount) {
  const shuffled = [...entries];

  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(
      Math.random() * (i + 1)
    );

    [
      shuffled[i],
      shuffled[j]
    ] = [
      shuffled[j],
      shuffled[i]
    ];
  }

  return shuffled.slice(0, amount);
}

/* =========================
   ORIGINAL MESSAGE
========================= */

async function getOriginalMessage(item) {
  try {
    const channel = await client.channels.fetch(
      item.channelId
    );

    if (!channel) {
      return null;
    }

    const message = await channel.messages.fetch(
      item.messageId
    );

    return message;
  } catch (error) {
    console.error(
      "Could not fetch original message:",
      error
    );

    return null;
  }
}

/* =========================
   GIVEAWAY FINISH
========================= */

async function finishGiveaway(
  giveaway,
  forcedBy = null
) {
  const collection = getCollection();

  const entries = giveaway.entries || [];

  const winnerCount = Math.min(
    giveaway.winners,
    entries.length
  );

  const winners = pickWinners(
    entries,
    winnerCount
  );

  await collection.updateOne(
    {
      messageId: giveaway.messageId
    },
    {
      $set: {
        finished: true,
        winnerIds: winners,
        endedAt: Date.now(),
        forcedBy: forcedBy
          ? forcedBy.id
          : null
      }
    }
  );

  const message =
    await getOriginalMessage(giveaway);

  if (!message) {
    return;
  }

  const winnerText = winners.length
    ? winners
        .map(id => `<@${id}>`)
        .join(", ")
    : "No winners";

  const forceText = forcedBy
    ? ` (FORCE ENDED BY <@${forcedBy.id}>)`
    : "";

  const embed = new EmbedBuilder()
    .setColor(0x57f287)
    .setTitle("🎉 GIVEAWAY ENDED!")
    .addFields(
      {
        name: "Prize",
        value: giveaway.prize
      },
      {
        name: "Hosted by",
        value: `<@${giveaway.hostId}>`
      },
      {
        name: "Participants",
        value: String(entries.length)
      },
      {
        name: "Winner(s)",
        value: `${winnerText}${forceText}`
      }
    );

  await message.edit({
    embeds: [embed],
    components: [
      createGiveawayButton(
        giveaway.messageId,
        entries.length,
        true
      )
    ]
  });

  if (winners.length) {
    await message.channel.send(
      `🎉 Congratulations ${winnerText}! You won **${giveaway.prize}**!${forceText}`
    );
  } else {
    await message.channel.send(
      `🎉 The giveaway for **${giveaway.prize}** ended with no winners.${forceText}`
    );
  }

  for (const winnerId of winners) {
    try {
      const user =
        await client.users.fetch(winnerId);

      await user.send(
        `🎉 Congratulations! You won **${giveaway.prize}**!${forceText}`
      );
    } catch (error) {
      console.error(
        `Could not DM winner ${winnerId}:`,
        error
      );
    }
  }

  try {
    const host =
      await client.users.fetch(
        giveaway.hostId
      );

    await host.send(
      `Your giveaway for **${giveaway.prize}** has ended.${forceText}`
    );
  } catch (error) {
    console.error(
      "Could not DM giveaway host:",
      error
    );
  }
}

/* =========================
   DROP CLAIM / FORCE END
========================= */

async function claimDrop(
  drop,
  winnerId = null,
  forcedBy = null
) {
  const collection = getCollection();

  const update = {
    finished: true,
    endedAt: Date.now(),
    winnerId: winnerId || null,
    forcedBy: forcedBy
      ? forcedBy.id
      : null
  };

  const result =
    await collection.findOneAndUpdate(
      {
        messageId: drop.messageId,
        type: "drop",
        finished: false
      },
      {
        $set: update
      },
      {
        returnDocument: "after"
      }
    );

  if (!result) {
    return false;
  }

  const message =
    await getOriginalMessage(drop);

  if (!message) {
    return false;
  }

  const forceText = forcedBy
    ? ` (FORCE ENDED BY <@${forcedBy.id}>)`
    : "";

  const winnerText = winnerId
    ? `<@${winnerId}>`
    : `No winner${forceText}`;

  const embed = new EmbedBuilder()
    .setColor(0x57f287)
    .setTitle("🎉 DROP ENDED!")
    .addFields(
      {
        name: "Prize",
        value: drop.prize || "No prize specified"
      },
      {
        name: "Hosted by",
        value: `<@${drop.hostId}>`
      },
      {
        name: "Winner",
        value: winnerText
      }
    );

  await message.edit({
    embeds: [embed],
    components: [
      createDropButton(
        drop.messageId,
        true
      )
    ]
  });

  if (winnerId) {
    await message.channel.send(
      `🎉 Congratulations <@${winnerId}>! You won **${drop.prize || "the drop"}**!`
    );

    try {
      const winner =
        await client.users.fetch(
          winnerId
        );

      await winner.send(
        `🎉 Congratulations! You won **${drop.prize || "the drop"}**!`
      );
    } catch (error) {
      console.error(
        "Could not DM drop winner:",
        error
      );
    }
  } else {
    await message.channel.send(
      `🎉 The drop has ended with no winner.${forceText}`
    );
  }

  try {
    const host =
      await client.users.fetch(
        drop.hostId
      );

    await host.send(
      winnerId
        ? `Your drop for **${drop.prize || "the drop"}** has been claimed by <@${winnerId}>.`
        : `Your drop has been force-ended.${forceText}`
    );
  } catch (error) {
    console.error(
      "Could not DM drop host:",
      error
    );
  }

  return true;
}

/* =========================
   GIVEAWAY SCHEDULER
========================= */

function scheduleGiveaway(giveaway) {
  const remaining =
    giveaway.endsAt - Date.now();

  if (remaining <= 0) {
    finishGiveaway(giveaway).catch(
      console.error
    );

    return;
  }

  const maxTimeout = 2147483647;

  const timeout =
    Math.min(
      remaining,
      maxTimeout
    );

  setTimeout(() => {
    if (remaining > maxTimeout) {
      scheduleGiveaway(giveaway);
      return;
    }

    finishGiveaway(giveaway).catch(
      console.error
    );
  }, timeout);
}

/* =========================
   CREATE GIVEAWAY
========================= */

async function createGiveaway(interaction) {
  const prize =
    interaction.options.getString(
      "prize",
      true
    );

  const durationText =
    interaction.options.getString(
      "duration",
      true
    );

  const winners =
    interaction.options.getInteger(
      "winners",
      true
    );

  const duration =
    parseDuration(durationText);

  if (!duration) {
    await interaction.reply({
      content:
        "Invalid duration. Use formats like `1M`, `5M`, `1H`, `6H`, `1D`, `7D`, `1W`, or `3W`.",
      ephemeral: true
    });

    return;
  }

  await interaction.reply({
    content: "Creating giveaway..."
  });

  const message =
    await interaction.fetchReply();

  const endsAt =
    Date.now() + duration;

  const giveaway = {
    type: "giveaway",
    messageId: message.id,
    channelId: interaction.channelId,
    guildId: interaction.guildId,
    hostId: interaction.user.id,
    prize,
    winners,
    entries: [],
    endsAt,
    finished: false,
    createdAt: Date.now()
  };

  const collection = getCollection();

  await collection.insertOne(
    giveaway
  );

  const embed = new EmbedBuilder()
    .setColor(0x57f287)
    .setTitle("🎉 GIVEAWAY!")
    .addFields(
      {
        name: "Prize",
        value: prize
      },
      {
        name: "Hosted by",
        value: `<@${interaction.user.id}>`
      },
      {
        name: "Winners",
        value: String(winners)
      },
      {
        name: "Participants",
        value: "0"
      }
    );

  await message.edit({
    content: "",
    embeds: [embed],
    components: [
      createGiveawayButton(
        message.id,
        0
      )
    ]
  });

  scheduleGiveaway(
    giveaway
  );
}

/* =========================
   CREATE DROP
========================= */

async function createDrop(interaction) {
  const prize =
    interaction.options.getString(
      "prize"
    );

  await interaction.reply({
    content: "Creating drop..."
  });

  const message =
    await interaction.fetchReply();

  const drop = {
    type: "drop",
    messageId: message.id,
    channelId: interaction.channelId,
    guildId: interaction.guildId,
    hostId: interaction.user.id,
    prize: prize || "",
    finished: false,
    createdAt: Date.now()
  };

  const collection = getCollection();

  await collection.insertOne(drop);

  const embed = new EmbedBuilder()
    .setColor(0x57f287)
    .setTitle("🎉 DROP!")
    .addFields(
      {
        name: "Prize",
        value:
          prize ||
          "No prize specified"
      },
      {
        name: "Hosted by",
        value: `<@${interaction.user.id}>`
      }
    );

  await message.edit({
    content: "",
    embeds: [embed],
    components: [
      createDropButton(
        message.id
      )
    ]
  });
}

/* =========================
   FORCE END MENU
========================= */

async function showForceEndMenu(
  interaction
) {
  const collection = getCollection();

  const activeItems =
    await collection
      .find({
        guildId: interaction.guildId,
        finished: false
      })
      .sort({
        createdAt: -1
      })
      .limit(25)
      .toArray();

  if (!activeItems.length) {
    await interaction.reply({
      content:
        "There are no active giveaways or drops.",
      ephemeral: true
    });

    return;
  }

  const options = activeItems.map(
    item => {
      const label =
        item.type === "giveaway"
          ? `Giveaway: ${item.prize}`
          : `Drop: ${
              item.prize ||
              "No prize"
            }`;

      return {
        label: label.slice(0, 100),
        value: item.messageId,
        description:
          item.type === "giveaway"
            ? `${item.entries?.length || 0} participants`
            : "First click wins"
      };
    }
  );

  const menu =
    new StringSelectMenuBuilder()
      .setCustomId(
        "force_end_select"
      )
      .setPlaceholder(
        "Select a giveaway or drop..."
      )
      .addOptions(options);

  const row =
    new ActionRowBuilder()
      .addComponents(menu);

  await interaction.reply({
    content:
      "Select the giveaway or drop you want to force-end:",
    components: [row],
    ephemeral: true
  });
}

/* =========================
   FORCE END
========================= */

async function forceEnd(
  interaction,
  messageId
) {
  const collection = getCollection();

  const item =
    await collection.findOne({
      messageId,
      guildId: interaction.guildId,
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
    await finishGiveaway(
      item,
      interaction.user
    );
  } else if (item.type === "drop") {
    await claimDrop(
      item,
      null,
      interaction.user
    );
  }

  await interaction.update({
    content:
      "Successfully force-ended.",
    components: []
  });
}

/* =========================
   RESTORE GIVEAWAYS
========================= */

async function restoreActiveGiveaways() {
  const collection = getCollection();

  const activeGiveaways =
    await collection
      .find({
        type: "giveaway",
        finished: false
      })
      .toArray();

  console.log(
    `Restoring ${activeGiveaways.length} active giveaway(s).`
  );

  for (const giveaway of activeGiveaways) {
    scheduleGiveaway(
      giveaway
    );
  }
}

/* =========================
   READY
========================= */

client.once(
  "clientReady",
  async () => {
    console.log(
      `ItamaRos Bot is online as ${client.user.tag}`
    );

    try {
      await connectDatabase();

      await registerCommands();

      await restoreActiveGiveaways();
    } catch (error) {
      console.error(
        "Startup error:",
        error
      );
    }
  }
);

/* =========================
   INTERACTIONS
========================= */

client.on(
  "interactionCreate",
  async interaction => {
    try {
      /* ---------- COMMANDS ---------- */

      if (interaction.isChatInputCommand()) {
        if (
          interaction.commandName ===
          "ping"
        ) {
          await interaction.reply(
            "Pong!"
          );

          return;
        }

        if (
          interaction.commandName ===
          "giveaway"
        ) {
          if (
            !interaction.memberPermissions.has(
              PermissionFlagsBits.ManageGuild
            )
          ) {
            await interaction.reply({
              content:
                "You need Manage Server permission to use this command.",
              ephemeral: true
            });

            return;
          }

          await createGiveaway(
            interaction
          );

          return;
        }

        if (
          interaction.commandName ===
          "drop"
        ) {
          if (
            !interaction.memberPermissions.has(
              PermissionFlagsBits.ManageGuild
            )
          ) {
            await interaction.reply({
              content:
                "You need Manage Server permission to use this command.",
              ephemeral: true
            });

            return;
          }

          await createDrop(
            interaction
          );

          return;
        }

        if (
          interaction.commandName ===
          "force-end"
        ) {
          if (
            !interaction.memberPermissions.has(
              PermissionFlagsBits.ManageGuild
            )
          ) {
            await interaction.reply({
              content:
                "You need Manage Server permission to use this command.",
              ephemeral: true
            });

            return;
          }

          await showForceEndMenu(
            interaction
          );

          return;
        }
      }

      /* ---------- GIVEAWAY BUTTON ---------- */

      if (
        interaction.isButton() &&
        interaction.customId.startsWith(
          "giveaway_"
        )
      ) {
        const messageId =
          interaction.customId.replace(
            "giveaway_",
            ""
          );

        const collection =
          getCollection();

        const giveaway =
          await collection.findOne({
            messageId,
            type: "giveaway",
            finished: false
          });

        if (!giveaway) {
          await interaction.reply({
            content:
              "This giveaway has already ended.",
            ephemeral: true
          });

          return;
        }

        if (
          giveaway.entries?.includes(
            interaction.user.id
          )
        ) {
          await interaction.reply({
            content:
              "You are already participating in this giveaway.",
            ephemeral: true
          });

          return;
        }

        const updated =
          await collection.findOneAndUpdate(
            {
              messageId,
              type: "giveaway",
              finished: false,
              entries: {
                $ne: interaction.user.id
              }
            },
            {
              $addToSet: {
                entries:
                  interaction.user.id
              }
            },
            {
              returnDocument: "after"
            }
          );

        if (!updated) {
          await interaction.reply({
            content:
              "You could not enter the giveaway.",
            ephemeral: true
          });

          return;
        }

        const message =
          await getOriginalMessage(
            updated
          );

        if (message) {
          await message.edit({
            components: [
              createGiveawayButton(
                updated.messageId,
                updated.entries.length
              )
            ]
          });
        }

        await interaction.reply({
          content:
            "You entered the giveaway!",
          ephemeral: true
        });

        return;
      }

      /* ---------- DROP BUTTON ---------- */

      if (
        interaction.isButton() &&
        interaction.customId.startsWith(
          "drop_"
        )
      ) {
        const messageId =
          interaction.customId.replace(
            "drop_",
            ""
          );

        const collection =
          getCollection();

        const drop =
          await collection.findOne({
            messageId,
            type: "drop",
            finished: false
          });

        if (!drop) {
          await interaction.reply({
            content:
              "This drop has already ended.",
            ephemeral: true
          });

          return;
        }

        const claimed =
          await claimDrop(
            drop,
            interaction.user.id
          );

        if (claimed) {
          await interaction.reply({
            content:
              "You won the drop!",
            ephemeral: true
          });
        } else {
          await interaction.reply({
            content:
              "Someone else already claimed the drop.",
            ephemeral: true
          });
        }

        return;
      }

      /* ---------- FORCE END SELECT ---------- */

      if (
        interaction.isStringSelectMenu() &&
        interaction.customId ===
          "force_end_select"
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

      if (
        interaction.replied ||
        interaction.deferred
      ) {
        await interaction.followUp({
          content:
            "An error occurred while processing the command.",
          ephemeral: true
        }).catch(() => {});
      } else {
        await interaction.reply({
          content:
            "An error occurred while processing the command.",
          ephemeral: true
        }).catch(() => {});
      }
    }
  }
);

/* =========================
   LOGIN
========================= */

client.login(TOKEN);
