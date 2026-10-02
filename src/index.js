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
  ButtonStyle
} = require("discord.js");

const {
  connectDatabase,
  getDatabase
} = require("./database");

const PORT = process.env.PORT || 3000;
const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

// =========================
// HTTP SERVER
// =========================

const server = http.createServer((req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/plain; charset=utf-8"
  });

  res.end("ItamaRos Bot is online!");
});

server.listen(PORT, () => {
  console.log(`Web server is running on port ${PORT}`);
});

// =========================
// DISCORD CLIENT
// =========================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// =========================
// SLASH COMMANDS
// =========================

const giveawayCommand = new SlashCommandBuilder()
  .setName("giveaway")
  .setDescription("Create a giveaway")
  .setDefaultMemberPermissions(
    PermissionFlagsBits.ManageGuild.toString()
  )
  .addStringOption(option =>
    option
      .setName("prize")
      .setDescription("What is the prize?")
      .setRequired(true)
  )
  .addStringOption(option =>
    option
      .setName("duration")
      .setDescription("Duration: 1M, 1H, 1D or 1W")
      .setRequired(true)
  )
  .addIntegerOption(option =>
    option
      .setName("winners")
      .setDescription("Number of winners")
      .setRequired(true)
      .setMinValue(1)
  );

const dropCommand = new SlashCommandBuilder()
  .setName("drop")
  .setDescription("Create a drop")
  .setDefaultMemberPermissions(
    PermissionFlagsBits.ManageGuild.toString()
  )
  .addStringOption(option =>
    option
      .setName("prize")
      .setDescription("What is the prize?")
      .setRequired(false)
  );

const pingCommand = new SlashCommandBuilder()
  .setName("ping")
  .setDescription("Check if the bot is online");

const commands = [
  giveawayCommand.toJSON(),
  dropCommand.toJSON(),
  pingCommand.toJSON()
];

// =========================
// REGISTER COMMANDS
// =========================

async function registerCommands() {
  if (!TOKEN || !CLIENT_ID) {
    console.error(
      "Missing DISCORD_TOKEN or CLIENT_ID environment variable."
    );

    return;
  }

  const rest = new REST({ version: "10" }).setToken(TOKEN);

  try {
    if (GUILD_ID) {
      await rest.put(
        Routes.applicationGuildCommands(
          CLIENT_ID,
          GUILD_ID
        ),
        {
          body: commands
        }
      );

      console.log(
        "Slash commands registered in the test server."
      );
    } else {
      await rest.put(
        Routes.applicationCommands(CLIENT_ID),
        {
          body: commands
        }
      );

      console.log(
        "Global slash commands registered."
      );
    }
  } catch (error) {
    console.error(
      "Failed to register slash commands:",
      error
    );
  }
}

// =========================
// DATABASE
// =========================

function getGiveawaysCollection() {
  return getDatabase().collection("giveaways");
}

// =========================
// DURATION PARSER
// =========================

function parseDuration(value) {
  if (typeof value !== "string") {
    return null;
  }

  const match = value
    .trim()
    .toUpperCase()
    .match(/^([1-9]\d*)(M|H|D|W)$/);

  if (!match) {
    return null;
  }

  const amount = Number(match[1]);
  const unit = match[2];

  const multipliers = {
    M: 60 * 1000,
    H: 60 * 60 * 1000,
    D: 24 * 60 * 60 * 1000,
    W: 7 * 24 * 60 * 60 * 1000
  };

  return amount * multipliers[unit];
}

// =========================
// GIVEAWAY BUTTON
// =========================

function createGiveawayButton(count) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("giveaway_enter")
      .setLabel(String(count))
      .setEmoji("🎉")
      .setStyle(ButtonStyle.Success)
  );
}

// =========================
// DROP BUTTON
// =========================

function createDropButton() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("drop_claim")
      .setLabel("0")
      .setEmoji("🎉")
      .setStyle(ButtonStyle.Success)
  );
}

// =========================
// FINISHED GIVEAWAY BUTTON
// =========================

function createFinishedGiveawayButton(count) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("giveaway_finished")
      .setLabel(String(count))
      .setEmoji("🎉")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true)
  );
}

// =========================
// FINISHED DROP BUTTON
// =========================

function createFinishedDropButton() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("drop_finished")
      .setLabel("CLAIMED")
      .setEmoji("🎉")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true)
  );
}

// =========================
// PICK WINNERS
// =========================

function pickWinners(entries, amount) {
  const shuffled = [...entries];

  for (let i = shuffled.length - 1; i > 0; i--) {
    const randomIndex = Math.floor(
      Math.random() * (i + 1)
    );

    [shuffled[i], shuffled[randomIndex]] = [
      shuffled[randomIndex],
      shuffled[i]
    ];
  }

  return shuffled.slice(
    0,
    Math.min(amount, shuffled.length)
  );
}

// =========================
// FINISH GIVEAWAY
// =========================

async function finishGiveaway(messageId) {
  const collection = getGiveawaysCollection();

  const giveaway = await collection.findOne({
    messageId,
    type: "giveaway",
    finished: false
  });

  if (!giveaway) {
    return;
  }

  const entries = giveaway.entries || [];

  const winners = pickWinners(
    entries,
    giveaway.winners
  );

  const updateResult = await collection.updateOne(
    {
      messageId,
      type: "giveaway",
      finished: false
    },
    {
      $set: {
        finished: true,
        winnerIds: winners
      }
    }
  );

  if (updateResult.modifiedCount !== 1) {
    return;
  }

  const channel = await client.channels
    .fetch(giveaway.channelId)
    .catch(() => null);

  if (!channel) {
    return;
  }

  const message = await channel.messages
    .fetch(messageId)
    .catch(() => null);

  if (!message) {
    return;
  }

  const endedEmbed = new EmbedBuilder()
    .setTitle("🎉 GIVEAWAY ENDED!")
    .setDescription(
      `**Prize:** ${giveaway.prize}\n\n` +
      `**Hosted by:** <@${giveaway.hostId}>\n\n` +
      `**Participants:** ${entries.length}`
    )
    .setFooter({
      text: "ItamaRos Bot"
    })
    .setTimestamp();

  if (winners.length === 0) {
    endedEmbed.addFields({
      name: "Winner",
      value: "No one entered the giveaway."
    });
  } else {
    const winnerMentions = winners
      .map(userId => `<@${userId}>`)
      .join(", ");

    endedEmbed.addFields({
      name: winners.length === 1
        ? "Winner"
        : "Winners",
      value: winnerMentions
    });
  }

  await message.edit({
    embeds: [endedEmbed],
    components: [
      createFinishedGiveawayButton(
        entries.length
      )
    ]
  });
}

// =========================
// FINISH DROP
// =========================

async function finishDrop(
  messageId,
  winnerId
) {
  const collection = getGiveawaysCollection();

  const updateResult = await collection.updateOne(
    {
      messageId,
      type: "drop",
      finished: false
    },
    {
      $set: {
        finished: true,
        winnerId
      }
    }
  );

  if (updateResult.modifiedCount !== 1) {
    return false;
  }

  const drop = await collection.findOne({
    messageId
  });

  if (!drop) {
    return false;
  }

  const channel = await client.channels
    .fetch(drop.channelId)
    .catch(() => null);

  if (!channel) {
    return false;
  }

  const message = await channel.messages
    .fetch(messageId)
    .catch(() => null);

  if (!message) {
    return false;
  }

  const endedEmbed = new EmbedBuilder()
    .setTitle("🎉 DROP ENDED!")
    .setDescription(
      `${drop.prize
        ? `**Prize:** ${drop.prize}\n\n`
        : ""}` +
      `**Hosted by:** <@${drop.hostId}>\n\n` +
      `**Winner:** <@${winnerId}>`
    )
    .setFooter({
      text: "ItamaRos Bot"
    })
    .setTimestamp();

  await message.edit({
    embeds: [endedEmbed],
    components: [
      createFinishedDropButton()
    ]
  });

  return true;
}

// =========================
// CREATE GIVEAWAY
// =========================

async function createGiveaway(
  interaction,
  prize,
  durationText,
  winners
) {
  const duration = parseDuration(
    durationText
  );

  if (!duration) {
    await interaction.reply({
      content:
        "Invalid duration. Use `1M`, `1H`, `1D` or `1W`.",
      ephemeral: true
    });

    return;
  }

  const endTime =
    Date.now() + duration;

  const embed = new EmbedBuilder()
    .setTitle("🎉 GIVEAWAY!")
    .setDescription(
      `**Prize:** ${prize}\n\n` +
      `**Hosted by:** ${interaction.user}\n\n` +
      `**Winners:** ${winners}\n\n` +
      `Click the button below to enter!`
    )
    .addFields({
      name: "Ends",
      value:
        `<t:${Math.floor(
          endTime / 1000
        )}:R>`
    })
    .setFooter({
      text: "ItamaRos Bot"
    })
    .setTimestamp();

  const message =
    await interaction.channel.send({
      embeds: [embed],
      components: [
        createGiveawayButton(0)
      ]
    });

  const collection =
    getGiveawaysCollection();

  await collection.insertOne({
    messageId: message.id,
    channelId:
      interaction.channel.id,
    guildId:
      interaction.guild.id,
    type: "giveaway",
    prize,
    winners,
    hostId:
      interaction.user.id,
    entries: [],
    winnerIds: [],
    endTime,
    finished: false,
    createdAt: new Date()
  });

  setTimeout(() => {
    finishGiveaway(
      message.id
    ).catch(console.error);
  }, duration);

  await interaction.reply({
    content:
      "Giveaway created successfully!",
    ephemeral: true
  });
}

// =========================
// CREATE DROP
// =========================

async function createDrop(
  interaction,
  prize
) {
  const embed = new EmbedBuilder()
    .setTitle("🎁 DROP!")
    .setDescription(
      `${prize
        ? `**Prize:** ${prize}\n\n`
        : ""}` +
      `**Hosted by:** ${interaction.user}\n\n` +
      `Be the first person to click the button!`
    )
    .setFooter({
      text: "ItamaRos Bot"
    })
    .setTimestamp();

  const message =
    await interaction.channel.send({
      embeds: [embed],
      components: [
        createDropButton()
      ]
    });

  const collection =
    getGiveawaysCollection();

  await collection.insertOne({
    messageId: message.id,
    channelId:
      interaction.channel.id,
    guildId:
      interaction.guild.id,
    type: "drop",
    prize: prize || null,
    hostId:
      interaction.user.id,
    entries: [],
    finished: false,
    winnerId: null,
    createdAt: new Date()
  });

  await interaction.reply({
    content:
      "Drop created successfully!",
    ephemeral: true
  });
}

// =========================
// RESTORE ACTIVE GIVEAWAYS
// =========================

async function restoreActiveGiveaways() {
  const collection =
    getGiveawaysCollection();

  const activeGiveaways =
    await collection
      .find({
        type: "giveaway",
        finished: false
      })
      .toArray();

  for (const giveaway of activeGiveaways) {
    const remainingTime =
      giveaway.endTime -
      Date.now();

    if (remainingTime <= 0) {
      await finishGiveaway(
        giveaway.messageId
      );

      continue;
    }

    setTimeout(() => {
      finishGiveaway(
        giveaway.messageId
      ).catch(console.error);
    }, remainingTime);
  }

  console.log(
    `Restored ${activeGiveaways.length} active giveaway(s).`
  );
}

// =========================
// BOT READY
// =========================

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
        "ItamaRos Bot startup completed successfully."
      );
    } catch (error) {
      console.error(
        "Startup error:",
        error
      );
    }
  }
);

// =========================
// INTERACTIONS
// =========================

client.on(
  "interactionCreate",
  async interaction => {
    try {
      // =========================
      // SLASH COMMANDS
      // =========================

      if (
        interaction.isChatInputCommand()
      ) {
        // =========================
        // PING
        // =========================

        if (
          interaction.commandName ===
          "ping"
        ) {
          await interaction.reply({
            content:
              `Pong! 🏓\nLatency: ${client.ws.ping}ms`
          });

          return;
        }

        // =========================
        // GIVEAWAY
        // =========================

        if (
          interaction.commandName ===
          "giveaway"
        ) {
          const prize =
            interaction.options.getString(
              "prize"
            );

          const duration =
            interaction.options.getString(
              "duration"
            );

          const winners =
            interaction.options.getInteger(
              "winners"
            );

          await createGiveaway(
            interaction,
            prize,
            duration,
            winners
          );

          return;
        }

        // =========================
        // DROP
        // =========================

        if (
          interaction.commandName ===
          "drop"
        ) {
          const prize =
            interaction.options.getString(
              "prize"
            );

          await createDrop(
            interaction,
            prize
          );

          return;
        }
      }

      // =========================
      // BUTTONS
      // =========================

      if (interaction.isButton()) {

        // =========================
        // GIVEAWAY ENTER
        // =========================

        if (
          interaction.customId ===
          "giveaway_enter"
        ) {
          const collection =
            getGiveawaysCollection();

          const giveaway =
            await collection.findOne({
              messageId:
                interaction.message.id,
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

          const entries =
            giveaway.entries || [];

          if (
            entries.includes(
              interaction.user.id
            )
          ) {
            await interaction.reply({
              content:
                "You are already entered in this giveaway!",
              ephemeral: true
            });

            return;
          }

          const updateResult =
            await collection.updateOne(
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
              }
            );

          if (
            updateResult.modifiedCount !==
            1
          ) {
            await interaction.reply({
              content:
                "You are already entered in this giveaway!",
              ephemeral: true
            });

            return;
          }

          const updatedGiveaway =
            await collection.findOne({
              messageId:
                interaction.message.id
            });

          const updatedEmbed =
            EmbedBuilder.from(
              interaction.message.embeds[0]
            );

          updatedEmbed.setDescription(
            `**Prize:** ${giveaway.prize}\n\n` +
            `**Hosted by:** <@${giveaway.hostId}>\n\n` +
            `**Winners:** ${giveaway.winners}\n\n` +
            `Click the button below to enter!`
          );

          await interaction.message.edit({
            embeds: [
              updatedEmbed
            ],
            components: [
              createGiveawayButton(
                updatedGiveaway.entries
                  .length
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

        // =========================
        // DROP CLAIM
        // =========================

        if (
          interaction.customId ===
          "drop_claim"
        ) {
          const claimed =
            await finishDrop(
              interaction.message.id,
              interaction.user.id
            );

          if (!claimed) {
            await interaction.reply({
              content:
                "This drop has already been claimed.",
              ephemeral: true
            });

            return;
          }

          await interaction.reply({
            content:
              "🎉 You won the drop!",
            ephemeral: true
          });

          return;
        }
      }
    } catch (error) {
      console.error(
        "Interaction error:",
        error
      );

      if (
        !interaction.replied &&
        !interaction.deferred
      ) {
        await interaction.reply({
          content:
            "Something went wrong while processing your request.",
          ephemeral: true
        });
      }
    }
  }
);

// =========================
// LOGIN
// =========================

if (!TOKEN) {
  console.error(
    "DISCORD_TOKEN is missing."
  );

  process.exit(1);
}

client.login(TOKEN);
