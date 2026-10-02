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
  .addIntegerOption(option =>
    option
      .setName("duration")
      .setDescription("Duration in seconds")
      .setRequired(true)
      .setMinValue(10)
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
  .setDescription("Create a quick giveaway drop")
  .setDefaultMemberPermissions(
    PermissionFlagsBits.ManageGuild.toString()
  )
  .addStringOption(option =>
    option
      .setName("prize")
      .setDescription("What is the prize?")
      .setRequired(true)
  )
  .addIntegerOption(option =>
    option
      .setName("duration")
      .setDescription("Duration in seconds")
      .setRequired(true)
      .setMinValue(10)
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
// GIVEAWAY STORAGE
// =========================

const giveaways = new Map();

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
  const giveaway = giveaways.get(messageId);

  if (!giveaway) {
    return;
  }

  giveaways.delete(messageId);

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

  const winners = pickWinners(
    [...giveaway.entries],
    giveaway.winners
  );

  const endedEmbed = new EmbedBuilder()
    .setTitle("🎉 Giveaway Ended!")
    .setDescription(
      `**Prize:** ${giveaway.prize}\n\n` +
      `**Hosted by:** <@${giveaway.hostId}>\n\n` +
      `**Participants:** ${giveaway.entries.size}`
    )
    .setFooter({
      text: "ItamaRos Bot"
    })
    .setTimestamp();

  if (winners.length === 0) {
    endedEmbed.addFields({
      name: "Winners",
      value: "No one entered the giveaway."
    });
  } else {
    const winnerMentions = winners
      .map(userId => `<@${userId}>`)
      .join(", ");

    endedEmbed.addFields({
      name: "Winners",
      value: winnerMentions
    });
  }

  const endedButton = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("giveaway_finished")
      .setLabel(String(giveaway.entries.size))
      .setEmoji("🎉")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true)
  );

  await message.edit({
    embeds: [endedEmbed],
    components: [endedButton]
  });

  if (winners.length > 0) {
    await channel.send(
      `🎉 Congratulations ${winners
        .map(userId => `<@${userId}>`)
        .join(", ")}! You won **${giveaway.prize}**!`
    );
  } else {
    await channel.send(
      `The giveaway for **${giveaway.prize}** ended with no entries.`
    );
  }
}

// =========================
// CREATE GIVEAWAY
// =========================

async function createGiveaway(
  interaction,
  prize,
  duration,
  winners
) {
  const endTime = Date.now() + duration * 1000;

  const embed = new EmbedBuilder()
    .setTitle("🎉 Giveaway!")
    .setDescription(
      `**Prize:** ${prize}\n\n` +
      `**Hosted by:** ${interaction.user}\n\n` +
      `**Winners:** ${winners}\n\n` +
      `Click the button below to enter!`
    )
    .addFields({
      name: "Ends",
      value: `<t:${Math.floor(endTime / 1000)}:R>`
    })
    .setFooter({
      text: "ItamaRos Bot"
    })
    .setTimestamp();

  const row = createGiveawayButton(0);

  const message = await interaction.channel.send({
    embeds: [embed],
    components: [row]
  });

  giveaways.set(message.id, {
    channelId: interaction.channel.id,
    prize,
    winners,
    hostId: interaction.user.id,
    entries: new Set(),
    endTime
  });

  setTimeout(() => {
    finishGiveaway(message.id);
  }, duration * 1000);

  await interaction.reply({
    content: "Giveaway created successfully!",
    ephemeral: true
  });
}

// =========================
// BOT READY
// =========================

client.once("clientReady", async () => {
  console.log(
    `ItamaRos Bot is online as ${client.user.tag}`
  );

  await registerCommands();
});

// =========================
// INTERACTIONS
// =========================

client.on("interactionCreate", async interaction => {
  try {
    // =========================
    // SLASH COMMANDS
    // =========================

    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === "ping") {
        await interaction.reply({
          content: `Pong! 🏓\nLatency: ${client.ws.ping}ms`
        });

        return;
      }

      if (interaction.commandName === "giveaway") {
        const prize =
          interaction.options.getString("prize");

        const duration =
          interaction.options.getInteger("duration");

        const winners =
          interaction.options.getInteger("winners");

        await createGiveaway(
          interaction,
          prize,
          duration,
          winners
        );

        return;
      }

      if (interaction.commandName === "drop") {
        const prize =
          interaction.options.getString("prize");

        const duration =
          interaction.options.getInteger("duration");

        await createGiveaway(
          interaction,
          prize,
          duration,
          1
        );

        return;
      }
    }

    // =========================
    // GIVEAWAY BUTTON
    // =========================

    if (interaction.isButton()) {
      if (
        interaction.customId ===
        "giveaway_enter"
      ) {
        const giveaway =
          giveaways.get(interaction.message.id);

        if (!giveaway) {
          await interaction.reply({
            content:
              "This giveaway has already ended.",
            ephemeral: true
          });

          return;
        }

        if (
          giveaway.entries.has(
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

        giveaway.entries.add(
          interaction.user.id
        );

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
          embeds: [updatedEmbed],
          components: [
            createGiveawayButton(
              giveaway.entries.size
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
});

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
