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
  return getDatabase().collection("giveaways");
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
        .setDescription("Duration: 1M, 1H, 1D or 1W.")
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

  console.log("Slash commands registered successfully.");
}

/* =========================
   DURATION
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

function createFinishedGiveawayButton(count) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("giveaway_finished")
      .setLabel(`🎉 Giveaway Ended (${count})`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true)
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
   GIVEAWAY EMBEDS
========================= */

function createGiveawayEmbed({
  prize,
  hostId,
  winnerCount,
  endsAt,
  participants
}) {
  return new EmbedBuilder()
    .setTitle("🎉 GIVEAWAY")
    .setDescription(
      `**Prize:** ${prize}\n\n` +
      `**Hosted by:** <@${hostId}>\n` +
      `**Winners:** ${winnerCount}\n` +
      `**Participants:** ${participants}\n` +
      `**Ends:** <t:${Math.floor(endsAt / 1000)}:R>`
    )
    .setFooter({
      text: "Click the button below to enter!"
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
      `**Participants:** ${participants}\n` +
      `**Winner${winners.length === 1 ? "" : "s"}:** ${winnerText}`
    );
}

/* =========================
   DROP EMBEDS
========================= */

function createDropEmbed({
  prize,
  hostId
}) {
  const prizeText = prize
    ? `**Prize:** ${prize}\n\n`
    : "";

  return new EmbedBuilder()
    .setTitle("🎉 DROP")
    .setDescription(
      `${prizeText}` +
      `**Hosted by:** <@${hostId}>\n\n` +
      `Be the first person to claim it!`
    )
    .setFooter({
      text: "First click wins!"
    });
}

function createEndedDropEmbed({
  prize,
  hostId,
  winnerId
}) {
  const prizeText = prize
    ? `**Prize:** ${prize}\n\n`
    : "";

  return new EmbedBuilder()
    .setTitle("🎉 DROP ENDED!")
    .setDescription(
      `${prizeText}` +
      `**Hosted by:** <@${hostId}>\n\n` +
      `**Winner:** <@${winnerId}>`
    );
}

/* =========================
   WINNER SELECTION
========================= */

function pickWinners(entries, amount) {
  const shuffled = [...entries];

  for (let i = shuffled.length - 1; i > 0; i--) {
    const randomIndex =
      Math.floor(Math.random() * (i + 1));

    [
      shuffled[i],
      shuffled[randomIndex]
    ] = [
      shuffled[randomIndex],
      shuffled[i]
    ];
  }

  return shuffled.slice(
    0,
    Math.min(amount, shuffled.length)
  );
}

/* =========================
   FETCH ORIGINAL MESSAGE
========================= */

async function fetchGiveawayMessage(item) {
  try {
    const channel = await client.channels.fetch(
      item.channelId
    );

    if (!channel || !channel.isTextBased()) {
      return null;
    }

    return await channel.messages.fetch(
      item.messageId
    );
  } catch (error) {
    console.error(
      `Could not fetch message ${item.messageId}:`,
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

  const entries = giveaway.entries || [];

  const winners = pickWinners(
    entries,
    giveaway.winnerCount
  );

  const result = await collection.updateOne(
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

  if (result.modifiedCount !== 1) {
    return false;
  }

  const message =
    await fetchGiveawayMessage(giveaway);

  if (message) {
    await message.edit({
      embeds: [
        createEndedGiveawayEmbed({
          prize: giveaway.prize,
          hostId: giveaway.hostId,
          participants: entries.length,
          winners
        })
      ],
      components: [
        createFinishedGiveawayButton(
          entries.length
        )
      ]
    });
  }

  console.log(
    `Giveaway ${messageId} ended.`
  );

  return true;
}

/* =========================
   CLAIM DROP
========================= */

async function claimDrop(
  messageId,
  userId
) {
  const collection =
    getGiveawaysCollection();

  /*
   * IMPORTANT:
   * The update only succeeds for the FIRST
   * person who clicks.
   */
  const drop = await collection.findOneAndUpdate(
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

  /*
   * MongoDB driver v6 returns the document
   * directly, NOT result.value.
   */
  if (!drop) {
    return null;
  }

  const message =
    await fetchGiveawayMessage(drop);

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
    `Drop ${messageId} won by ${userId}.`
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
    finishGiveaway(
      giveaway.messageId
    ).catch(error => {
      console.error(
        "Failed to finish giveaway:",
        error
      );
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
      finishGiveaway(
        giveaway.messageId
      ).catch(error => {
        console.error(
          "Failed to finish giveaway:",
          error
        );
      });
    }
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

  const durationInput =
    interaction.options.getString(
      "duration",
      true
    );

  const winnerCount =
    interaction.options.getInteger(
      "winners",
      true
    );

  const duration =
    parseDuration(durationInput);

  if (!duration) {
    await interaction.reply({
      content:
        "Invalid duration. Use formats like `1M`, `1H`, `1D`, or `1W`.",
      ephemeral: true
    });

    return;
  }

  const endsAt =
    Date.now() + duration;

  /*
   * Create the Discord message first.
   */
  const message =
    await interaction.reply({
      embeds: [
        createGiveawayEmbed({
          prize,
          hostId: interaction.user.id,
          winnerCount,
          endsAt,
          participants: 0
        })
      ],
      components: [
        createGiveawayButton(0)
      ],
      fetchReply: true
    });

  /*
   * Then save it in MongoDB.
   */
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

  await getGiveawaysCollection()
    .insertOne(giveaway);

  scheduleGiveaway(giveaway);
}

/* =========================
   CREATE DROP
========================= */

async function createDrop(interaction) {
  const prize =
    interaction.options.getString(
      "prize"
    );

  /*
   * IMPORTANT:
   * There is NO timer here.
   */
  const message =
    await interaction.reply({
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

  await getGiveawaysCollection()
    .insertOne({
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

async function showForceEndMenu(
  interaction
) {
  const activeItems =
    await getGiveawaysCollection()
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
      content:
        "There are no active giveaways or drops.",
      ephemeral: true
    });

    return;
  }

  const options =
    activeItems.map(item => {
      const type =
        item.type === "giveaway"
          ? "🎉 Giveaway"
          : "💥 Drop";

      const prize =
        item.prize || "No prize";

      return {
        label:
          `${type}: ${prize}`.slice(
            0,
            100
          ),
        description:
          item.type === "giveaway"
            ? `${item.entries?.length || 0} participants`
            : "First person to click wins",
        value: item.messageId
      };
    });

  const menu =
    new StringSelectMenuBuilder()
      .setCustomId(
        "force_end_select"
      )
      .setPlaceholder(
        "Choose an active giveaway or drop"
      )
      .addOptions(options);

  const row =
    new ActionRowBuilder()
      .addComponents(menu);

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

async function forceEnd(
  interaction,
  messageId
) {
  const collection =
    getGiveawaysCollection();

  const item =
    await collection.findOne({
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
    const ended =
      await finishGiveaway(
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

  /*
   * Force-ending a Drop means nobody wins,
   * because nobody claimed it first.
   */
  const result =
    await collection.updateOne(
      {
        _id: item._id,
        finished: false
      },
      {
        $set: {
          finished: true,
          winnerId: null,
          forceEnded: true,
          endedAt: Date.now()
        }
      }
    );

  if (result.modifiedCount !== 1) {
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
    const prizeText =
      item.prize
        ? `**Prize:** ${item.prize}\n\n`
        : "";

    await message.edit({
      embeds: [
        new EmbedBuilder()
          .setTitle("🎉 DROP ENDED!")
          .setDescription(
            `${prizeText}` +
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

/* =========================
   RESTORE GIVEAWAYS
========================= */

async function restoreActiveGiveaways() {
  const giveaways =
    await getGiveawaysCollection()
      .find({
        type: "giveaway",
        finished: false
      })
      .toArray();

  for (const giveaway of giveaways) {
    scheduleGiveaway(giveaway);
  }

  console.log(
    `Restored ${giveaways.length} active giveaway(s).`
  );
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

      console.log(
        "Bot startup completed successfully."
      );
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
      /* =====================
         SLASH COMMANDS
      ===================== */

      if (
        interaction.isChatInputCommand()
      ) {
        if (
          interaction.commandName ===
          "ping"
        ) {
          await interaction.reply({
            content: "Pong! 🏓",
            ephemeral: true
          });

          return;
        }

        if (
          interaction.commandName ===
            "giveaway" ||
          interaction.commandName ===
            "drop" ||
          interaction.commandName ===
            "force-end"
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

        if (
          interaction.commandName ===
          "giveaway"
        ) {
          await createGiveaway(
            interaction
          );

          return;
        }

        if (
          interaction.commandName ===
          "drop"
        ) {
          await createDrop(
            interaction
          );

          return;
        }

        if (
          interaction.commandName ===
          "force-end"
        ) {
          await showForceEndMenu(
            interaction
          );

          return;
        }
      }

      /* =====================
         GIVEAWAY BUTTON
      ===================== */

      if (
        interaction.isButton() &&
        interaction.customId ===
          "giveaway_enter"
      ) {
        const collection =
          getGiveawaysCollection();

        /*
         * First check whether the user
         * is already entered.
         */
        const existing =
          await collection.findOne({
            messageId:
              interaction.message.id,
            type: "giveaway",
            finished: false,
            entries:
              interaction.user.id
          });

        if (existing) {
          await interaction.reply({
            content:
              "You are already entered in this giveaway!",
            ephemeral: true
          });

          return;
        }

        /*
         * Add the user atomically.
         */
        const result =
          await collection.findOneAndUpdate(
            {
              messageId:
                interaction.message.id,
              type: "giveaway",
              finished: false,
              entries: {
                $ne:
                  interaction.user.id
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

        /*
         * MongoDB driver v6:
         * result IS the document.
         */
        const giveaway = result;

        if (!giveaway) {
          await interaction.reply({
            content:
              "This giveaway is no longer active.",
            ephemeral: true
          });

          return;
        }

        const count =
          giveaway.entries.length;

        /*
         * Update the ORIGINAL message
         * with the new participant count.
         */
        await interaction.message.edit({
          embeds: [
            createGiveawayEmbed({
              prize: giveaway.prize,
              hostId:
                giveaway.hostId,
              winnerCount:
                giveaway.winnerCount,
              endsAt:
                giveaway.endsAt,
              participants:
                count
            })
          ],
          components: [
            createGiveawayButton(
              count
            )
          ]
        });

        await interaction.reply({
          content:
            "You have entered the giveaway! 🎉",
          ephemeral: true
        });

        return;
      }

      /* =====================
         DROP BUTTON
      ===================== */

      if (
        interaction.isButton() &&
        interaction.customId ===
          "drop_claim"
      ) {
        /*
         * MongoDB makes this atomic.
         * Only ONE person can change
         * finished:false -> finished:true.
         */
        const drop =
          await claimDrop(
            interaction.message.id,
            interaction.user.id
          );

        if (!drop) {
          await interaction.reply({
            content:
              "Too late! Someone already claimed this drop.",
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

      /* =====================
         FORCE END SELECT
      ===================== */

      if (
        interaction.isStringSelectMenu() &&
        interaction.customId ===
          "force_end_select"
      ) {
        await forceEnd(
          interaction,
          interaction.values[0]
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
        await interaction
          .followUp({
            content:
              "Something went wrong while processing this interaction.",
            ephemeral: true
          })
          .catch(() => {});
      } else {
        await interaction
          .reply({
            content:
              "Something went wrong while processing this interaction.",
            ephemeral: true
          })
          .catch(() => {});
      }
    }
  }
);

/* =========================
   LOGIN
========================= */

client.login(TOKEN).catch(error => {
  console.error(
    "Discord login failed:",
    error
  );
});
