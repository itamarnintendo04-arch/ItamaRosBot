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

  /*
   * Register only the four commands
   * on the test server.
   */
  await rest.put(
    Routes.applicationGuildCommands(
      CLIENT_ID,
      GUILD_ID
    ),
    {
      body: commands
    }
  );

  /*
   * Delete old global commands.
   * This removes old commands such as:
   * /giveaway random
   * /giveaway fast
   *
   * The four commands above remain
   * available through the server.
   */
  await rest.put(
    Routes.applicationCommands(
      CLIENT_ID
    ),
    {
      body: []
    }
  );

  console.log(
    "Slash commands registered successfully:"
  );

  console.log(
    commands.map(command => command.name).join(", ")
  );
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

function giveawayButton(count) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("giveaway_enter")
      .setLabel(`🎉 Enter Giveaway (${count})`)
      .setStyle(ButtonStyle.Success)
  );
}

function giveawayEndedButton(count) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("giveaway_ended")
      .setLabel(`🎉 Giveaway Ended (${count})`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true)
  );
}

function dropButton() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("drop_claim")
      .setLabel("🎉 CLAIM")
      .setStyle(ButtonStyle.Success)
  );
}

function dropEndedButton() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("drop_ended")
      .setLabel("🎉 DROP ENDED")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true)
  );
}

/* =========================
   EMBEDS
========================= */

function giveawayEmbed(data) {
  return new EmbedBuilder()
    .setTitle("🎉 GIVEAWAY")
    .setDescription(
      `**Prize:** ${data.prize}\n\n` +
      `**Hosted by:** <@${data.hostId}>\n` +
      `**Winners:** ${data.winnerCount}\n` +
      `**Participants:** ${data.participants}\n` +
      `**Ends:** <t:${Math.floor(data.endsAt / 1000)}:R>`
    )
    .setFooter({
      text: "Click the button below to enter!"
    });
}

function giveawayEndedEmbed(data) {
  const winnerText =
    data.winners.length > 0
      ? data.winners.map(id => `<@${id}>`).join(", ")
      : "No winners";

  return new EmbedBuilder()
    .setTitle("🎉 GIVEAWAY ENDED!")
    .setDescription(
      `**Prize:** ${data.prize}\n\n` +
      `**Hosted by:** <@${data.hostId}>\n` +
      `**Participants:** ${data.participants}\n` +
      `**Winner${data.winners.length === 1 ? "" : "s"}:** ${winnerText}`
    );
}

function dropEmbed(data) {
  const prizeText = data.prize
    ? `**Prize:** ${data.prize}\n\n`
    : "";

  return new EmbedBuilder()
    .setTitle("🎉 DROP")
    .setDescription(
      `${prizeText}` +
      `**Hosted by:** <@${data.hostId}>\n\n` +
      `Be the first person to claim it!`
    )
    .setFooter({
      text: "First click wins!"
    });
}

function dropEndedEmbed(data) {
  const prizeText = data.prize
    ? `**Prize:** ${data.prize}\n\n`
    : "";

  return new EmbedBuilder()
    .setTitle("🎉 DROP ENDED!")
    .setDescription(
      `${prizeText}` +
      `**Hosted by:** <@${data.hostId}>\n\n` +
      `**Winner:** <@${data.winnerId}>`
    );
}

/* =========================
   WINNERS
========================= */

function pickWinners(entries, amount) {
  const shuffled = [...entries];

  for (let i = shuffled.length - 1; i > 0; i--) {
    const randomIndex =
      Math.floor(Math.random() * (i + 1));

    [shuffled[i], shuffled[randomIndex]] =
      [shuffled[randomIndex], shuffled[i]];
  }

  return shuffled.slice(
    0,
    Math.min(amount, shuffled.length)
  );
}

/* =========================
   FETCH MESSAGE
========================= */

async function getOriginalMessage(item) {
  try {
    const channel =
      await client.channels.fetch(item.channelId);

    if (!channel || !channel.isTextBased()) {
      return null;
    }

    return await channel.messages.fetch(
      item.messageId
    );
  } catch (error) {
    console.error(
      "Could not fetch original message:",
      error.message
    );

    return null;
  }
}

/* =========================
   SEND WINNER NOTIFICATIONS
========================= */

async function sendGiveawayNotifications(
  giveaway,
  winners
) {
  const channel =
    await client.channels.fetch(
      giveaway.channelId
    ).catch(() => null);

  if (channel && channel.isTextBased()) {
    const winnerMentions =
      winners.length > 0
        ? winners.map(id => `<@${id}>`).join(", ")
        : "Nobody";

    await channel.send({
      content:
        `🎉 Congratulations ${winnerMentions}! ` +
        `You won the **${giveaway.prize}** giveaway!`
    }).catch(() => {});
  }

  for (const winnerId of winners) {
    const winner =
      await client.users.fetch(winnerId)
        .catch(() => null);

    if (winner) {
      await winner.send(
        `🎉 Congratulations! You won the **${giveaway.prize}** giveaway in **${channel?.guild?.name || "the server"}**!`
      ).catch(() => {});
    }
  }

  const host =
    await client.users.fetch(
      giveaway.hostId
    ).catch(() => null);

  if (host) {
    const winnerText =
      winners.length > 0
        ? winners.map(id => `<@${id}>`).join(", ")
        : "Nobody";

    await host.send(
      `🎉 Your giveaway for **${giveaway.prize}** has ended!\n\n` +
      `Winner${winners.length === 1 ? "" : "s"}: ${winnerText}`
    ).catch(() => {});
  }
}

async function sendDropNotifications(
  drop,
  winnerId
) {
  const channel =
    await client.channels.fetch(
      drop.channelId
    ).catch(() => null);

  if (channel && channel.isTextBased()) {
    await channel.send({
      content:
        `🎉 Congratulations <@${winnerId}>! ` +
        `You won the **${drop.prize || "drop"}**!`
    }).catch(() => {});
  }

  const winner =
    await client.users.fetch(winnerId)
      .catch(() => null);

  if (winner) {
    await winner.send(
      `🎉 Congratulations! You won the **${drop.prize || "drop"}**!`
    ).catch(() => {});
  }

  const host =
    await client.users.fetch(
      drop.hostId
    ).catch(() => null);

  if (host) {
    await host.send(
      `🎉 Your Drop has been claimed!\n\n` +
      `Winner: <@${winnerId}>` +
      `${drop.prize ? `\nPrize: **${drop.prize}**` : ""}`
    ).catch(() => {});
  }
}

/* =========================
   FINISH GIVEAWAY
========================= */

async function finishGiveaway(messageId) {
  const collection = getCollection();

  const giveaway =
    await collection.findOne({
      messageId,
      type: "giveaway",
      finished: false
    });

  if (!giveaway) {
    return false;
  }

  const entries =
    giveaway.entries || [];

  const winners =
    pickWinners(
      entries,
      giveaway.winnerCount
    );

  const update =
    await collection.updateOne(
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

  if (update.modifiedCount !== 1) {
    return false;
  }

  const message =
    await getOriginalMessage(giveaway);

  if (message) {
    await message.edit({
      embeds: [
        giveawayEndedEmbed({
          prize: giveaway.prize,
          hostId: giveaway.hostId,
          participants: entries.length,
          winners
        })
      ],
      components: [
        giveawayEndedButton(
          entries.length
        )
      ]
    }).catch(() => {});
  }

  await sendGiveawayNotifications(
    giveaway,
    winners
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
  const collection = getCollection();

  /*
   * Only the first click can claim
   * the drop.
   */
  const drop =
    await collection.findOneAndUpdate(
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

  if (!drop) {
    return null;
  }

  const message =
    await getOriginalMessage(drop);

  if (message) {
    await message.edit({
      embeds: [
        dropEndedEmbed({
          prize: drop.prize,
          hostId: drop.hostId,
          winnerId: userId
        })
      ],
      components: [
        dropEndedButton()
      ]
    }).catch(() => {});
  }

  await sendDropNotifications(
    drop,
    userId
  );

  return drop;
}

/* =========================
   GIVEAWAY TIMER
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

  const timeout =
    Math.min(
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
        "Invalid duration. Use `1M`, `1H`, `1D`, or `1W`.",
      ephemeral: true
    });

    return;
  }

  const endsAt =
    Date.now() + duration;

  const message =
    await interaction.reply({
      embeds: [
        giveawayEmbed({
          prize,
          hostId: interaction.user.id,
          winnerCount,
          endsAt,
          participants: 0
        })
      ],
      components: [
        giveawayButton(0)
      ],
      fetchReply: true
    });

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

  await getCollection()
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
   * NO TIMER.
   * Drop stays active until someone clicks
   * or an admin uses /force-end.
   */
  const message =
    await interaction.reply({
      embeds: [
        dropEmbed({
          prize,
          hostId: interaction.user.id
        })
      ],
      components: [
        dropButton()
      ],
      fetchReply: true
    });

  await getCollection()
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
    await getCollection()
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
            : "First click wins",
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
  const collection = getCollection();

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

  /*
   * FORCE END GIVEAWAY
   */
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
   * FORCE END DROP
   * Nobody wins because nobody claimed it.
   */
  const update =
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

  if (update.modifiedCount !== 1) {
    await interaction.update({
      content:
        "The drop could not be ended.",
      components: []
    });

    return;
  }

  const message =
    await getOriginalMessage(item);

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
        dropEndedButton()
      ]
    }).catch(() => {});
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
    await getCollection()
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

        /*
         * Giveaway, Drop and Force End
         * require Manage Server.
         */
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
         GIVEAWAY ENTRY
      ===================== */

      if (
        interaction.isButton() &&
        interaction.customId ===
          "giveaway_enter"
      ) {
        const collection =
          getCollection();

        /*
         * Check if this user already entered.
         */
        const alreadyEntered =
          await collection.findOne({
            messageId:
              interaction.message.id,
            type: "giveaway",
            finished: false,
            entries:
              interaction.user.id
          });

        if (alreadyEntered) {
          await interaction.reply({
            content:
              "You are already entered in this giveaway!",
            ephemeral: true
          });

          return;
        }

        /*
         * Atomically add the user.
         */
        const giveaway =
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
         * Update the ORIGINAL giveaway message.
         */
        await interaction.message.edit({
          embeds: [
            giveawayEmbed({
              prize:
                giveaway.prize,
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
            giveawayButton(count)
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
         DROP CLAIM
      ===================== */

      if (
        interaction.isButton() &&
        interaction.customId ===
          "drop_claim"
      ) {
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
