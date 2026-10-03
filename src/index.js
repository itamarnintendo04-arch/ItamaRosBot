require("dotenv").config();

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
  StringSelectMenuBuilder,
  RoleSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  MessageFlags
} = require("discord.js");

const {
  connectDatabase,
  getDatabase
} = require("./database");

const economy = require("./economy");
const shop = require("./shop");

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
      `Web server is running on port ${
        process.env.PORT || 3000
      }`
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
   REQUIRED CHANNEL PERMISSIONS
========================= */

const REQUIRED_CHANNEL_PERMISSIONS = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.EmbedLinks,
  PermissionFlagsBits.ReadMessageHistory
];

/* =========================
   PERMISSION NAMES
========================= */

const PERMISSION_NAMES = {
  [PermissionFlagsBits.ViewChannel]:
    "View Channel",

  [PermissionFlagsBits.SendMessages]:
    "Send Messages",

  [PermissionFlagsBits.EmbedLinks]:
    "Embed Links",

  [PermissionFlagsBits.ReadMessageHistory]:
    "Read Message History"
};

/* =========================
   CHECK CHANNEL PERMISSIONS
========================= */

async function getMissingChannelPermissions(channel) {
  if (!channel || !channel.guild) {
    return [];
  }

  let me = channel.guild.members.me;

  if (!me) {
    try {
      me = await channel.guild.members.fetchMe();
    } catch (error) {
      console.error(
        "Could not fetch the bot member for permission check:",
        error
      );

      return [];
    }
  }

  const permissions =
    channel.permissionsFor(me);

  if (!permissions) {
    return [];
  }

  if (
    permissions.has(
      PermissionFlagsBits.Administrator
    )
  ) {
    return [];
  }

  return REQUIRED_CHANNEL_PERMISSIONS
    .filter(
      permission =>
        !permissions.has(permission)
    )
    .map(
      permission =>
        PERMISSION_NAMES[permission]
    );
}

  const permissions =
    channel.permissionsFor(me);

  if (!permissions) {
    return [
      "View Channel",
      "Send Messages",
      "Embed Links",
      "Read Message History"
    ];
  }

  return REQUIRED_CHANNEL_PERMISSIONS
    .filter(
      permission =>
        !permissions.has(permission)
    )
    .map(
      permission =>
        PERMISSION_NAMES[permission]
    );
}

/* =========================
   PERMISSION ERROR MESSAGE
========================= */

function permissionErrorMessage(
  missingPermissions
) {
  return [
    "❌ **I don't have the required permissions in this channel.**",
    "",
    "**Required permissions:**",
    ...missingPermissions.map(
      permission =>
        `- ${permission}`
    ),
    "",
    "**Please give these permissions to the bot's role.**"
  ].join("\n");
}

/* =========================
   CHECK COMMAND CHANNEL
========================= */

async function checkCommandPermissions(
  interaction
) {
  const channel =
    interaction.channel;

  const missing =
    getMissingChannelPermissions(
      channel
    );

  if (!missing.length) {
    return true;
  }

  await interaction.reply({
    content:
      permissionErrorMessage(
        missing
      ),
    flags:
      MessageFlags.Ephemeral
  });

  return false;
}

/* =========================
   CHECK BUTTON CHANNEL
========================= */

async function checkButtonPermissions(
  interaction
) {
  const channel =
    interaction.channel;

  const missing =
    getMissingChannelPermissions(
      channel
    );

  if (!missing.length) {
    return true;
  }

  if (
    interaction.deferred ||
    interaction.replied
  ) {
    await interaction.editReply({
      content:
        permissionErrorMessage(
          missing
        ),
      components: []
    });
  } else {
    await interaction.reply({
      content:
        permissionErrorMessage(
          missing
        ),
      flags:
        MessageFlags.Ephemeral
    });
  }

  return false;
}

/* =========================
   SLASH COMMANDS
========================= */

const commands = [
  new SlashCommandBuilder()
    .setName("ping")
    .setDescription(
      "Check if the bot is online."
    ),

  new SlashCommandBuilder()
    .setName("giveaway")
    .setDescription(
      "Start a giveaway."
    )
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageGuild.toString()
    )
    .addStringOption(option =>
      option
        .setName("prize")
        .setDescription(
          "The giveaway prize."
        )
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
        .setDescription(
          "Number of winners."
        )
        .setRequired(true)
        .setMinValue(1)
    ),

  new SlashCommandBuilder()
    .setName("drop")
    .setDescription(
      "Start a first-click drop."
    )
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageGuild.toString()
    )
    .addStringOption(option =>
      option
        .setName("prize")
        .setDescription(
          "The drop prize."
        )
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("force-end")
    .setDescription(
      "Force-end an active giveaway or drop."
    )
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageGuild.toString()
    )
];


/* =========================
   ECONOMY / SHOP COMMANDS
========================= */

function isManager(interaction) {
  return Boolean(
    interaction.memberPermissions?.has(
      PermissionFlagsBits.ManageGuild
    )
  );
}

function shortId(item) {
  return item?._id ? item._id.toString() : "unknown";
}

function shopItemEmbed(item, member) {
  const pricing = shop.calculatePrice(item, member);
  const discountText = pricing.discount.percent
    ? `${pricing.discount.percent}%`
    : "None";

  return new EmbedBuilder()
    .setColor(0x57f287)
    .setTitle(`${item.emoji || "🛍️"} ${item.name}`)
    .setDescription(item.description || "No description.")
    .addFields(
      { name: "Price", value: `~~${pricing.price}~~ → **${pricing.finalPrice} coins**` },
      { name: "Your discount", value: discountText, inline: true },
      { name: "Stock", value: shop.stockText(item), inline: true },
      { name: "XP reward", value: String(item.xpReward || 0), inline: true },
      { name: "Category", value: item.category || "General", inline: true },
      { name: "Purchase limit", value: shop.purchaseLimitText(item), inline: true },
      { name: "Item ID", value: `\`${shortId(item)}\`` }
    )
    .setFooter({ text: item.enabled ? "Available in the shop" : "Disabled" });
}

function shopItemControls(item, manager) {
  const firstRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`shop_buy_${shortId(item)}`)
      .setLabel("🛒 BUY")
      .setStyle(ButtonStyle.Success)
      .setDisabled(!item.enabled),
    new ButtonBuilder()
      .setCustomId(`shop_edit_${shortId(item)}`)
      .setLabel("✏️ EDIT")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(!manager),
    new ButtonBuilder()
      .setCustomId(`shop_delete_${shortId(item)}`)
      .setLabel("🗑️ DELETE")
      .setStyle(ButtonStyle.Danger)
      .setDisabled(!manager),
    new ButtonBuilder()
      .setCustomId(`shop_toggle_${shortId(item)}`)
      .setLabel(item.enabled ? "🔴 DISABLE" : "🟢 ENABLE")
      .setStyle(item.enabled ? ButtonStyle.Secondary : ButtonStyle.Success)
      .setDisabled(!manager),
    new ButtonBuilder()
      .setCustomId(`shop_discounts_${shortId(item)}`)
      .setLabel("🏷️ DISCOUNTS")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!manager)
  );

  return [firstRow];
}

function shopListComponents(items) {
  const options = items.map(item => ({
    label: `${item.emoji || "🛍️"} ${item.name}`.slice(0, 100),
    value: shortId(item),
    description: `${item.price} coins • Stock: ${shop.stockText(item)}`.slice(0, 100)
  }));

  return [
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId("shop_select")
        .setPlaceholder("Select an item...")
        .addOptions(options)
    )
  ];
}

async function showShopItem(interaction, item) {
  const manager = isManager(interaction);
  await interaction.reply({
    embeds: [shopItemEmbed(item, interaction.member)],
    components: shopItemControls(item, manager),
    flags: MessageFlags.Ephemeral
  });
}

async function showDiscountPanel(interaction, item) {
  const discounts = shop.normalizeDiscounts(item.roleDiscounts);
  const guild = interaction.guild;

  const lines = discounts.length
    ? discounts.map(discount => {
        const role = guild.roles.cache.get(discount.roleId);
        return `${role ? role.toString() : `<@&${discount.roleId}>`} — **${discount.percent}%**`;
      })
    : ["No role discounts configured."];

  const rows = [];
  rows.push(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`shop_add_discount_${shortId(item)}`)
        .setLabel("➕ ADD ROLE DISCOUNT")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`shop_remove_discount_${shortId(item)}`)
        .setLabel("➖ REMOVE ROLE DISCOUNT")
        .setStyle(ButtonStyle.Danger)
        .setDisabled(!discounts.length),
      new ButtonBuilder()
        .setCustomId(`shop_back_${shortId(item)}`)
        .setLabel("↩️ BACK")
        .setStyle(ButtonStyle.Secondary)
    )
  );

  await interaction.reply({
    content: `🏷️ **Role discounts for ${item.emoji || "🛍️"} ${item.name}**\n\n${lines.join("\n")}\n\nA customer can have multiple matching roles, but only the **2 highest discounts** are added together.`,
    components: rows,
    flags: MessageFlags.Ephemeral
  });
}

function editShopModal(item) {
  return new ModalBuilder()
    .setCustomId(`shop_edit_modal_${shortId(item)}`)
    .setTitle("Edit shop item")
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("name")
          .setLabel("Name")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(100)
          .setValue(item.name)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("description")
          .setLabel("Description")
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setMaxLength(1000)
          .setValue(item.description || "")
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("price")
          .setLabel("Price")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setValue(String(item.price))
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("stock")
          .setLabel("Stock (0 = infinite)")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setValue(String(item.stock))
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("xp")
          .setLabel("XP reward")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setValue(String(item.xpReward || 0))
      )
    );
}

function rewardText(type, amount, itemId) {
  if (!type || type === "none") return "None";
  if (type === "xp") return `${amount} XP`;
  if (type === "coins") return `${amount} coins`;
  if (type === "shop_item") return `${amount} × shop item ${itemId}`;
  return "None";
}

async function awardReward(guildId, userId, reward) {
  if (!reward || reward.type === "none") return;
  if (reward.type === "xp") {
    await economy.addXp(guildId, userId, reward.amount);
  } else if (reward.type === "coins") {
    await economy.addCoins(guildId, userId, reward.amount);
  } else if (reward.type === "shop_item" && reward.itemId) {
    const item = await shop.getItem(guildId, reward.itemId);
    if (item) {
      await economy.grantInventoryItem(guildId, userId, reward.itemId, reward.amount);
    }
  }
}

/* =========================
   COMMAND REGISTRATION
========================= */


commands.push(
  new SlashCommandBuilder()
    .setName("balance")
    .setDescription("View your coins and XP."),

  new SlashCommandBuilder()
    .setName("level")
    .setDescription("View your XP level."),

  new SlashCommandBuilder()
    .setName("leaderboard")
    .setDescription("Show the XP leaderboard."),

  new SlashCommandBuilder()
    .setName("inventory")
    .setDescription("View your shop-item rewards."),

  new SlashCommandBuilder()
    .setName("steal")
    .setDescription("Roll a die and steal virtual coins from a random member."),

  new SlashCommandBuilder()
    .setName("coins")
    .setDescription("Manage a user's coins.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild.toString())
    .addSubcommand(sub => sub.setName("add").setDescription("Add coins.").addUserOption(o => o.setName("user").setDescription("User").setRequired(true)).addIntegerOption(o => o.setName("amount").setDescription("Amount").setMinValue(1).setRequired(true)))
    .addSubcommand(sub => sub.setName("remove").setDescription("Remove coins.").addUserOption(o => o.setName("user").setDescription("User").setRequired(true)).addIntegerOption(o => o.setName("amount").setDescription("Amount").setMinValue(1).setRequired(true)))
    .addSubcommand(sub => sub.setName("set").setDescription("Set coins.").addUserOption(o => o.setName("user").setDescription("User").setRequired(true)).addIntegerOption(o => o.setName("amount").setDescription("Amount").setMinValue(0).setRequired(true))),

  new SlashCommandBuilder()
    .setName("xp")
    .setDescription("Manage a user's XP.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild.toString())
    .addSubcommand(sub => sub.setName("add").setDescription("Add XP.").addUserOption(o => o.setName("user").setDescription("User").setRequired(true)).addIntegerOption(o => o.setName("amount").setDescription("Amount").setMinValue(1).setRequired(true)))
    .addSubcommand(sub => sub.setName("remove").setDescription("Remove XP.").addUserOption(o => o.setName("user").setDescription("User").setRequired(true)).addIntegerOption(o => o.setName("amount").setDescription("Amount").setMinValue(1).setRequired(true)))
    .addSubcommand(sub => sub.setName("set").setDescription("Set XP.").addUserOption(o => o.setName("user").setDescription("User").setRequired(true)).addIntegerOption(o => o.setName("amount").setDescription("Amount").setMinValue(0).setRequired(true))),

  new SlashCommandBuilder()
    .setName("shop")
    .setDescription("Open the server shop."),

  new SlashCommandBuilder()
    .setName("shop-add")
    .setDescription("Add an item to the shop.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild.toString())
    .addStringOption(o => o.setName("name").setDescription("Item name").setRequired(true))
    .addStringOption(o => o.setName("description").setDescription("Item description").setRequired(true))
    .addIntegerOption(o => o.setName("price").setDescription("Base price in coins").setMinValue(0).setRequired(true))
    .addIntegerOption(o => o.setName("stock").setDescription("0 = infinite").setMinValue(0).setRequired(false))
    .addIntegerOption(o => o.setName("xp-reward").setDescription("XP awarded after purchase").setMinValue(0).setRequired(false))
    .addStringOption(o => o.setName("category").setDescription("Category").setRequired(false))
    .addStringOption(o => o.setName("emoji").setDescription("Emoji").setRequired(false))
    .addIntegerOption(o => o.setName("purchase-limit").setDescription("0 = unlimited per user").setMinValue(0).setRequired(false)),

  new SlashCommandBuilder()
    .setName("shop-edit")
    .setDescription("Edit a shop item.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild.toString())
    .addStringOption(o => o.setName("item").setDescription("Shop item ID").setRequired(true))
    .addStringOption(o => o.setName("name").setDescription("New name").setRequired(false))
    .addStringOption(o => o.setName("description").setDescription("New description").setRequired(false))
    .addIntegerOption(o => o.setName("price").setDescription("New price").setMinValue(0).setRequired(false))
    .addIntegerOption(o => o.setName("stock").setDescription("0 = infinite").setMinValue(0).setRequired(false))
    .addIntegerOption(o => o.setName("xp-reward").setDescription("New XP reward").setMinValue(0).setRequired(false))
    .addStringOption(o => o.setName("category").setDescription("New category").setRequired(false))
    .addStringOption(o => o.setName("emoji").setDescription("New emoji").setRequired(false))
    .addIntegerOption(o => o.setName("purchase-limit").setDescription("0 = unlimited").setMinValue(0).setRequired(false)),

  new SlashCommandBuilder()
    .setName("shop-delete")
    .setDescription("Delete a shop item.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild.toString())
    .addStringOption(o => o.setName("item").setDescription("Shop item ID").setRequired(true)),

  new SlashCommandBuilder()
    .setName("shop-toggle")
    .setDescription("Enable or disable a shop item.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild.toString())
    .addStringOption(o => o.setName("item").setDescription("Shop item ID").setRequired(true)),

);

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
    commands
      .map(command => command.name)
      .join(", ")
  );
}

/* =========================
   DURATION
========================= */

function parseDuration(duration) {
  const match =
    /^(\d+)(M|H|D|W)$/i.exec(
      duration.trim()
    );

  if (!match) {
    return null;
  }

  const amount =
    Number(match[1]);

  const unit =
    match[2].toUpperCase();

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
   FORCE-END TEXT
========================= */

function forceEndedText(userId) {
  return `-# *(force ended by <@${userId}>)*`;
}

/* =========================
   GIVEAWAY BUTTON
========================= */

function createGiveawayButton(
  messageId,
  count,
  disabled = false
) {
  return new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(
          `giveaway_${messageId}`
        )
        .setLabel(
          `🎉 ${count} ENTRIES`
        )
        .setStyle(
          ButtonStyle.Success
        )
        .setDisabled(disabled)
    );
}

/* =========================
   GIVEAWAY USER BUTTONS
========================= */

function createGiveawayUserButtons(
  messageId
) {
  return new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(
          `giveaway_leave_${messageId}`
        )
        .setLabel("❌ LEAVE")
        .setStyle(
          ButtonStyle.Danger
        ),

      new ButtonBuilder()
        .setCustomId(
          `giveaway_keep_${messageId}`
        )
        .setLabel(
          "✅ KEEP ME IN"
        )
        .setStyle(
          ButtonStyle.Success
        )
    );
}

/* =========================
   ENTER AGAIN BUTTON
========================= */

function createEnterAgainButton(
  messageId
) {
  return new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(
          `giveaway_enter_again_${messageId}`
        )
        .setLabel(
          "🎉 ENTER AGAIN"
        )
        .setStyle(
          ButtonStyle.Success
        )
    );
}

/* =========================
   DROP BUTTON
========================= */

function createDropButton(
  messageId,
  disabled = false
) {
  return new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(
          `drop_${messageId}`
        )
        .setLabel(
          "🎉 CLAIM"
        )
        .setStyle(
          ButtonStyle.Success
        )
        .setDisabled(disabled)
    );
}

/* =========================
   WINNER SELECTION
========================= */

function pickWinners(
  entries,
  amount
) {
  const shuffled = [
    ...entries
  ];

  for (
    let i =
      shuffled.length - 1;
    i > 0;
    i--
  ) {
    const j =
      Math.floor(
        Math.random() *
          (i + 1)
      );

    [
      shuffled[i],
      shuffled[j]
    ] = [
      shuffled[j],
      shuffled[i]
    ];
  }

  return shuffled.slice(
    0,
    amount
  );
}

/* =========================
   ORIGINAL MESSAGE
========================= */

async function getOriginalMessage(
  item
) {
  try {
    const channel =
      await client.channels.fetch(
        item.channelId
      );

    if (!channel) {
      return null;
    }

    return await channel.messages.fetch(
      item.messageId
    );
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
  const collection =
    getCollection();

  const entries =
    giveaway.entries || [];

  const winnerCount =
    Math.min(
      giveaway.winners,
      entries.length
    );

  const winners =
    pickWinners(
      entries,
      winnerCount
    );

  await collection.updateOne(
    {
      messageId:
        giveaway.messageId
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
    await getOriginalMessage(
      giveaway
    );

  if (!message) {
    return;
  }

  const forceText =
    forcedBy
      ? forceEndedText(
          forcedBy.id
        )
      : "";

  if (
    entries.length === 0
  ) {
    const embed =
      new EmbedBuilder()
        .setColor(0x57f287)
        .setTitle(
          "🎉 GIVEAWAY ENDED!"
        )
        .addFields(
          {
            name: "Prize",
            value:
              giveaway.prize
          },
          {
            name: "Hosted by",
            value:
              `<@${giveaway.hostId}>`
          },
          {
            name: "ENTRIES",
            value: "0"
          },
          {
            name: "Winner(s)",
            value:
              "No winner"
          }
        );

    await message.edit({
      embeds: [embed],
      components: [
        createGiveawayButton(
          giveaway.messageId,
          0,
          true
        )
      ]
    });

    await message.channel.send(
      `🎉 GIVEAWAY ENDED!\n\nPrize: **${giveaway.prize}**\nWinner: **No winner**${forceText}`
    );

    try {
      const host =
        await client.users.fetch(
          giveaway.hostId
        );

      await host.send(
        `Your giveaway has ended.\n\nPrize: **${giveaway.prize}**\nWinner: **No winner**${forceText}`
      );
    } catch (error) {
      console.error(
        "Could not DM giveaway host:",
        error
      );
    }

    return;
  }

  const winnerText =
    winners.length
      ? winners
          .map(
            id =>
              `<@${id}>`
          )
          .join(", ")
      : "No winner";

  const embed =
    new EmbedBuilder()
      .setColor(0x57f287)
      .setTitle(
        "🎉 GIVEAWAY ENDED!"
      )
      .addFields(
        {
          name: "Prize",
          value:
            giveaway.prize
        },
        {
          name: "Hosted by",
          value:
            `<@${giveaway.hostId}>`
        },
        {
          name: "ENTRIES",
          value:
            String(
              entries.length
            )
        },
        {
          name: "Winner(s)",
          value:
            winnerText
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

  await message.channel.send(
    `🎉 GIVEAWAY ENDED!\n\nPrize: **${giveaway.prize}**\nWinner(s): ${winnerText}${forceText}`
  );

  for (
    const winnerId of
    winners
  ) {
    try {
      const user =
        await client.users.fetch(
          winnerId
        );

      await user.send(
        `🎉 GIVEAWAY ENDED!\n\nPrize: **${giveaway.prize}**\nYou won!${forceText}`
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
      `🎉 Your giveaway has ended.\n\nPrize: **${giveaway.prize}**\nWinner(s): ${winnerText}${forceText}`
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
  const collection =
    getCollection();

  const result =
    await collection.findOneAndUpdate(
      {
        messageId:
          drop.messageId,
        type: "drop",
        finished: false
      },
      {
        $set: {
          finished: true,
          endedAt: Date.now(),
          winnerId:
            winnerId || null,
          forcedBy: forcedBy
            ? forcedBy.id
            : null
        }
      },
      {
        returnDocument:
          "after"
      }
    );

  if (!result) {
    return false;
  }

  const message =
    await getOriginalMessage(
      drop
    );

  if (!message) {
    return false;
  }

  const forceText =
    forcedBy
      ? forceEndedText(
          forcedBy.id
        )
      : "";

  const winnerText =
    winnerId
      ? `<@${winnerId}>`
      : "No winner";

  const embed =
    new EmbedBuilder()
      .setColor(0x57f287)
      .setTitle(
        "🎉 DROP ENDED!"
      )
      .addFields(
        {
          name: "Prize",
          value:
            drop.prize ||
            "No prize specified"
        },
        {
          name: "Hosted by",
          value:
            `<@${drop.hostId}>`
        },
        {
          name: "Winner",
          value:
            winnerText
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
      `🎉 DROP ENDED!\n\nPrize: **${
        drop.prize ||
        "the drop"
      }**\nWinner: ${winnerText}${forceText}`
    );

    try {
      const winner =
        await client.users.fetch(
          winnerId
        );

      await winner.send(
        `🎉 DROP ENDED!\n\nPrize: **${
          drop.prize ||
          "the drop"
        }**\nYou won!${forceText}`
      );
    } catch (error) {
      console.error(
        "Could not DM drop winner:",
        error
      );
    }
  } else {
    await message.channel.send(
      `🎉 DROP ENDED!\n\nPrize: **${
        drop.prize ||
        "the drop"
      }**\nWinner: **No winner**${forceText}`
    );
  }

  try {
    const host =
      await client.users.fetch(
        drop.hostId
      );

    await host.send(
      winnerId
        ? `Your drop has ended.\n\nPrize: **${
            drop.prize ||
            "the drop"
          }**\nWinner: ${winnerText}${forceText}`
        : `Your drop has been force-ended.\n\nPrize: **${
            drop.prize ||
            "the drop"
          }**\nWinner: **No winner**${forceText}`
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

function scheduleGiveaway(
  giveaway
) {
  const remaining =
    giveaway.endsAt -
    Date.now();

  if (remaining <= 0) {
    finishGiveaway(
      giveaway
    ).catch(console.error);

    return;
  }

  const maxTimeout =
    2147483647;

  const timeout =
    Math.min(
      remaining,
      maxTimeout
    );

  setTimeout(() => {
    if (
      remaining >
      maxTimeout
    ) {
      scheduleGiveaway(
        giveaway
      );

      return;
    }

    finishGiveaway(
      giveaway
    ).catch(console.error);
  }, timeout);
}

/* =========================
   CREATE GIVEAWAY
========================= */

async function createGiveaway(
  interaction
) {
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
    parseDuration(
      durationText
    );

  if (!duration) {
    await interaction.reply({
      content:
        "Invalid duration. Use formats like `1M`, `5M`, `1H`, `6H`, `1D`, `7D`, `1W`, or `3W`.",
      flags:
        MessageFlags.Ephemeral
    });

    return;
  }

  if (
    !(await checkCommandPermissions(
      interaction
    ))
  ) {
    return;
  }

  /*
    Discord's real interaction loading state.
    We intentionally DO NOT edit the reply
    with "LOADING" or another custom message.
  */
  await interaction.deferReply({
    flags:
      MessageFlags.Ephemeral
  });

  const endsAt =
    Date.now() +
    duration;

  const giveaway = {
    type: "giveaway",
    messageId: null,
    channelId:
      interaction.channelId,
    guildId:
      interaction.guildId,
    hostId:
      interaction.user.id,
    prize,
    winners,
    entries: [],
    endsAt,
    finished: false,
    createdAt: Date.now()
  };

  const collection =
    getCollection();

  const insertResult =
    await collection.insertOne(
      giveaway
    );

  giveaway._id =
    insertResult.insertedId;

  const message =
    await interaction.channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(0x57f287)
          .setTitle(
            "🎉 GIVEAWAY!"
          )
          .addFields(
            {
              name: "Prize",
              value: prize
            },
            {
              name: "Hosted by",
              value:
                `<@${interaction.user.id}>`
            },
            {
              name: "Winners",
              value:
                String(
                  winners
                )
            },
            {
              name: "ENTRIES",
              value: "0"
            }
          )
      ]
    });

  giveaway.messageId =
    message.id;

  await collection.updateOne(
    {
      _id:
        giveaway._id
    },
    {
      $set: {
        messageId:
          message.id
      }
    }
  );

  await message.edit({
    components: [
      createGiveawayButton(
        message.id,
        0
      )
    ]
  });

  await interaction.deleteReply();

  scheduleGiveaway(
    giveaway
  );
}

/* =========================
   CREATE DROP
========================= */

async function createDrop(
  interaction
) {
  const prize =
    interaction.options.getString(
      "prize"
    );

  if (
    !(await checkCommandPermissions(
      interaction
    ))
  ) {
    return;
  }

  /*
    Discord's real interaction loading state.
    No custom "LOADING" message is sent.
  */
  await interaction.deferReply({
    flags:
      MessageFlags.Ephemeral
  });

  const drop = {
    type: "drop",
    messageId: null,
    channelId:
      interaction.channelId,
    guildId:
      interaction.guildId,
    hostId:
      interaction.user.id,
    prize:
      prize || "",
    finished: false,
    createdAt: Date.now()
  };

  const collection =
    getCollection();

  const insertResult =
    await collection.insertOne(
      drop
    );

  drop._id =
    insertResult.insertedId;

  const message =
    await interaction.channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(0x57f287)
          .setTitle(
            "🎉 DROP!"
          )
          .addFields(
            {
              name: "Prize",
              value:
                prize ||
                "No prize specified"
            },
            {
              name: "Hosted by",
              value:
                `<@${interaction.user.id}>`
            }
          )
      ]
    });

  drop.messageId =
    message.id;

  await collection.updateOne(
    {
      _id:
        drop._id
    },
    {
      $set: {
        messageId:
          message.id
      }
    }
  );

  await message.edit({
    components: [
      createDropButton(
        message.id
      )
    ]
  });

  await interaction.deleteReply();
}

/* =========================
   FORCE END MENU
========================= */

async function showForceEndMenu(
  interaction
) {
  if (
    !(await checkCommandPermissions(
      interaction
    ))
  ) {
    return;
  }

  const collection =
    getCollection();

  const activeItems =
    await collection
      .find({
        guildId:
          interaction.guildId,
        finished: false
      })
      .sort({
        createdAt: -1
      })
      .limit(25)
      .toArray();

  if (
    !activeItems.length
  ) {
    await interaction.reply({
      content:
        "There are no active giveaways or drops.",
      flags:
        MessageFlags.Ephemeral
    });

    return;
  }

  const options =
    activeItems.map(
      item => {
        const label =
          item.type ===
          "giveaway"
            ? `Giveaway: ${item.prize}`
            : `Drop: ${
                item.prize ||
                "No prize"
              }`;

        return {
          label:
            label.slice(
              0,
              100
            ),
          value:
            item.messageId,
          description:
            item.type ===
            "giveaway"
              ? `${
                  item.entries
                    ?.length ||
                  0
                } ENTRIES`
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
      .addOptions(
        options
      );

  const row =
    new ActionRowBuilder()
      .addComponents(
        menu
      );

  await interaction.reply({
    content:
      "Select the giveaway or drop you want to force-end:",
    components: [row],
    flags:
      MessageFlags.Ephemeral
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
    getCollection();

  const item =
    await collection.findOne({
      messageId,
      guildId:
        interaction.guildId,
      finished: false
    });

  if (!item) {
    await interaction.editReply({
      content:
        "That giveaway or drop is no longer active.",
      components: []
    });

    return;
  }

  if (
    item.type ===
    "giveaway"
  ) {
    await finishGiveaway(
      item,
      interaction.user
    );
  } else if (
    item.type ===
    "drop"
  ) {
    await claimDrop(
      item,
      null,
      interaction.user
    );
  }

  await interaction.editReply({
    content:
      "Successfully force-ended.",
    components: []
  });
}

/* =========================
   RESTORE GIVEAWAYS
========================= */

async function restoreActiveGiveaways() {
  const collection =
    getCollection();

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

  for (
    const giveaway of
    activeGiveaways
  ) {
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
          const latency =
            Date.now() -
            interaction.createdTimestamp;

          await interaction.reply({
            content:
              `PONG! 🏓\n${Math.max(
                0,
                latency
              )} MS`
          });

          return;
        }

        if (["balance", "level", "leaderboard", "inventory"].includes(interaction.commandName)) {
          const account = await economy.getAccount(interaction.guildId, interaction.user.id);

          if (interaction.commandName === "balance") {
            await interaction.reply({
              content: `💰 **${interaction.user.username}**\n\nCoins: **${account.coins}**\nXP: **${account.xp}**\nLevel: **${economy.levelFromXp(account.xp)}**`,
              flags: MessageFlags.Ephemeral
            });
            return;
          }

          if (interaction.commandName === "level") {
            const level = economy.levelFromXp(account.xp);
            const currentLevelXp = economy.xpForLevel(level);
            const nextLevelXp = economy.xpForLevel(level + 1);
            await interaction.reply({
              content: `⭐ **Level ${level}**\n\nXP: **${account.xp}**\nProgress: **${account.xp - currentLevelXp} / ${nextLevelXp - currentLevelXp} XP**`,
              flags: MessageFlags.Ephemeral
            });
            return;
          }

          if (interaction.commandName === "leaderboard") {
            const leaderboard = await economy.getLeaderboard(interaction.guildId, 10);
            if (!leaderboard.length) {
              await interaction.reply({ content: "No XP data yet.", flags: MessageFlags.Ephemeral });
              return;
            }

            const lines = [];
            for (let i = 0; i < leaderboard.length; i++) {
              const row = leaderboard[i];
              const user = await client.users.fetch(row.userId).catch(() => null);
              lines.push(`**${i + 1}.** ${user ? user.username : row.userId} — Level **${economy.levelFromXp(row.xp)}** • **${row.xp} XP**`);
            }

            await interaction.reply({
              embeds: [new EmbedBuilder().setColor(0x57f287).setTitle("⭐ XP LEADERBOARD").setDescription(lines.join("\n"))]
            });
            return;
          }

          const inventory = await economy.getInventory(interaction.guildId, interaction.user.id);
          const entries = Object.entries(inventory).filter(([, amount]) => amount > 0);
          if (!entries.length) {
            await interaction.reply({ content: "🎒 Your inventory is empty.", flags: MessageFlags.Ephemeral });
            return;
          }

          const lines = [];
          for (const [itemId, amount] of entries) {
            const item = await shop.getItem(interaction.guildId, itemId);
            lines.push(`• ${item ? `${item.emoji || "🛍️"} **${item.name}**` : `Item \`${itemId}\``} × **${amount}**`);
          }
          await interaction.reply({ content: `🎒 **Your inventory**\n\n${lines.join("\n")}`, flags: MessageFlags.Ephemeral });
          return;
        }

        if (interaction.commandName === "steal") {
          const result = await economy.stealCoins(interaction.guild, interaction.user.id);
          if (result.cooldown) {
            await interaction.reply({ content: `⏳ Try again in **${result.cooldown}s**.`, flags: MessageFlags.Ephemeral });
            return;
          }
          if (result.noTarget) {
            await interaction.reply({ content: "There are no other members to steal from.", flags: MessageFlags.Ephemeral });
            return;
          }
          await interaction.reply({
            content: `🎲 You rolled **${result.die}**!\n\nYou stole **${result.amount} coins** from <@${result.target.id}>.\nYour balance is now **${result.thief.coins} coins**.`
          });
          return;
        }

        if (interaction.commandName === "coins" || interaction.commandName === "xp") {
          if (!isManager(interaction)) {
            await interaction.reply({ content: "You need Manage Server permission to use this command.", flags: MessageFlags.Ephemeral });
            return;
          }

          const subcommand = interaction.options.getSubcommand();
          const user = interaction.options.getUser("user", true);
          const amount = interaction.options.getInteger("amount", true);
          const isCoins = interaction.commandName === "coins";
          let account;

          if (isCoins) {
            if (subcommand === "add") account = await economy.addCoins(interaction.guildId, user.id, amount);
            if (subcommand === "remove") account = await economy.removeCoins(interaction.guildId, user.id, amount);
            if (subcommand === "set") account = await economy.setCoins(interaction.guildId, user.id, amount);
          } else {
            if (subcommand === "add") account = await economy.addXp(interaction.guildId, user.id, amount).then(result => result.account);
            if (subcommand === "remove") account = await economy.removeXp(interaction.guildId, user.id, amount);
            if (subcommand === "set") account = await economy.setXp(interaction.guildId, user.id, amount);
          }

          await interaction.reply({
            content: `✅ Updated <@${user.id}>.\n\nCoins: **${account.coins}**\nXP: **${account.xp}**\nLevel: **${economy.levelFromXp(account.xp)}**`,
            flags: MessageFlags.Ephemeral
          });
          return;
        }

        if (interaction.commandName === "shop") {
          const items = await shop.getEnabledItems(interaction.guildId);
          if (!items.length) {
            await interaction.reply({ content: "🛍️ The shop is empty right now.", flags: MessageFlags.Ephemeral });
            return;
          }
          await interaction.reply({
            embeds: [new EmbedBuilder().setColor(0x57f287).setTitle("🛍️ ITAMAROS SHOP").setDescription("Select an item below to view it and buy it.")],
            components: shopListComponents(items),
            flags: MessageFlags.Ephemeral
          });
          return;
        }

        if (interaction.commandName === "shop-add") {
          if (!isManager(interaction)) {
            await interaction.reply({ content: "You need Manage Server permission to use this command.", flags: MessageFlags.Ephemeral });
            return;
          }
          const item = await shop.createItem({
            guildId: interaction.guildId,
            name: interaction.options.getString("name", true),
            description: interaction.options.getString("description", true),
            price: interaction.options.getInteger("price", true),
            stock: interaction.options.getInteger("stock") ?? 0,
            xpReward: interaction.options.getInteger("xp-reward") ?? 0,
            category: interaction.options.getString("category") || "General",
            emoji: interaction.options.getString("emoji") || "🛍️",
            purchaseLimit: interaction.options.getInteger("purchase-limit") ?? 0,
            createdBy: interaction.user.id
          });
          await interaction.reply({
            content: `✅ Shop item created: **${item.name}**\n\nItem ID: \`${shortId(item)}\`\n\nUse the shop to open **DISCOUNTS** and configure role discounts.`,
            flags: MessageFlags.Ephemeral
          });
          return;
        }

        if (interaction.commandName === "shop-edit") {
          if (!isManager(interaction)) {
            await interaction.reply({ content: "You need Manage Server permission to use this command.", flags: MessageFlags.Ephemeral });
            return;
          }
          const itemId = interaction.options.getString("item", true);
          const changes = {};
          const name = interaction.options.getString("name");
          const description = interaction.options.getString("description");
          const price = interaction.options.getInteger("price");
          const stock = interaction.options.getInteger("stock");
          const xpReward = interaction.options.getInteger("xp-reward");
          const category = interaction.options.getString("category");
          const emoji = interaction.options.getString("emoji");
          const purchaseLimit = interaction.options.getInteger("purchase-limit");
          if (name !== null) changes.name = name;
          if (description !== null) changes.description = description;
          if (price !== null) changes.price = price;
          if (stock !== null) changes.stock = stock;
          if (xpReward !== null) changes.xpReward = xpReward;
          if (category !== null) changes.category = category;
          if (emoji !== null) changes.emoji = emoji;
          if (purchaseLimit !== null) changes.purchaseLimit = purchaseLimit;
          if (!Object.keys(changes).length) {
            await interaction.reply({ content: "Provide at least one field to edit.", flags: MessageFlags.Ephemeral });
            return;
          }
          const updated = await shop.updateItem(interaction.guildId, itemId, changes);
          await interaction.reply({
            content: updated ? `✅ **${updated.name}** updated.` : "❌ Shop item not found.",
            flags: MessageFlags.Ephemeral
          });
          return;
        }

        if (interaction.commandName === "shop-delete") {
          if (!isManager(interaction)) {
            await interaction.reply({ content: "You need Manage Server permission to use this command.", flags: MessageFlags.Ephemeral });
            return;
          }
          const deleted = await shop.deleteItem(interaction.guildId, interaction.options.getString("item", true));
          await interaction.reply({ content: deleted ? "🗑️ Shop item deleted." : "❌ Shop item not found.", flags: MessageFlags.Ephemeral });
          return;
        }

        if (interaction.commandName === "shop-toggle") {
          if (!isManager(interaction)) {
            await interaction.reply({ content: "You need Manage Server permission to use this command.", flags: MessageFlags.Ephemeral });
            return;
          }
          const updated = await shop.toggleItem(interaction.guildId, interaction.options.getString("item", true));
          await interaction.reply({ content: updated ? `✅ **${updated.name}** is now **${updated.enabled ? "enabled" : "disabled"}**.` : "❌ Shop item not found.", flags: MessageFlags.Ephemeral });
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
              flags:
                MessageFlags.Ephemeral
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
              flags:
                MessageFlags.Ephemeral
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
              flags:
                MessageFlags.Ephemeral
            });

            return;
          }

          await showForceEndMenu(
            interaction
          );

          return;
        }
      }

      /* =====================
         SHOP SELECT
      ===================== */

      if (interaction.isStringSelectMenu() && interaction.customId === "shop_select") {
        const item = await shop.getItem(interaction.guildId, interaction.values[0]);
        if (!item) {
          await interaction.update({ content: "❌ That shop item no longer exists.", embeds: [], components: [] });
          return;
        }
        await interaction.update({
          embeds: [shopItemEmbed(item, interaction.member)],
          components: shopItemControls(item, isManager(interaction))
        });
        return;
      }

      /* =====================
         SHOP BUY
      ===================== */

      if (interaction.isButton() && interaction.customId.startsWith("shop_buy_")) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const itemId = interaction.customId.replace("shop_buy_", "");
        const result = await shop.purchaseItem({
          guildId: interaction.guildId,
          userId: interaction.user.id,
          member: interaction.member,
          itemId
        });

        if (!result.ok) {
          const messages = {
            not_found: "❌ Shop item not found.",
            disabled: "❌ This item is disabled.",
            purchase_limit: "❌ You reached your purchase limit for this item.",
            not_enough_coins: `❌ You don't have enough coins.\n\nYour balance: **${result.account?.coins ?? 0}**\nPrice: **${result.pricing?.finalPrice ?? result.item?.price ?? 0}**`,
            sold_out_or_limit: "❌ Someone bought the last available stock or you reached the purchase limit. Your coins were refunded.",
            out_of_stock: "❌ This item is out of stock."
          };
          await interaction.editReply({ content: messages[result.reason] || "❌ The purchase failed." });
          return;
        }

        const xpResult = await shop.addPurchaseXp(interaction.guildId, interaction.user.id, result.item);
        const xpText = result.item.xpReward ? `\nXP reward: **+${result.item.xpReward} XP**` : "";

        await interaction.editReply({
          content: `✅ **Purchase successful!**\n\nItem: ${result.item.emoji || "🛍️"} **${result.item.name}**\nPaid: **${result.pricing.finalPrice} coins**\nDiscount: **${result.pricing.discount.percent}%**${xpText}`
        });

        await interaction.user.send(
          `🛍️ **Purchase confirmation**\n\nServer: **${interaction.guild.name}**\nItem: **${result.item.name}**\nPaid: **${result.pricing.finalPrice} coins**\nDiscount: **${result.pricing.discount.percent}%**${xpText}`
        ).catch(() => {});

        await interaction.channel.send(
          `🛍️ <@${interaction.user.id}> purchased **${result.item.name}** for **${result.pricing.finalPrice} coins**.`
        ).catch(() => {});

        const guild = interaction.guild;
        await guild.members.fetch().catch(() => null);
        const managers = guild.members.cache.filter(member =>
          !member.user.bot && member.permissions.has(PermissionFlagsBits.ManageGuild)
        );
        for (const manager of managers.values()) {
          await manager.send(
            `🛍️ Shop purchase in **${guild.name}**\n\nBuyer: ${interaction.user.tag}\nItem: **${result.item.name}**\nPaid: **${result.pricing.finalPrice} coins**`
          ).catch(() => {});
        }
        return;
      }

      /* =====================
         SHOP MANAGER BUTTONS
      ===================== */

      if (interaction.isButton() && interaction.customId.startsWith("shop_") && isManager(interaction)) {
        const [prefix, action, itemId] = interaction.customId.split("_");
        if (prefix !== "shop") return;
        const item = await shop.getItem(interaction.guildId, itemId);
        if (!item) {
          await interaction.reply({ content: "❌ Shop item not found.", flags: MessageFlags.Ephemeral });
          return;
        }

        if (action === "edit") {
          await interaction.showModal(editShopModal(item));
          return;
        }

        if (action === "delete") {
          await shop.deleteItem(interaction.guildId, itemId);
          await interaction.update({ content: "🗑️ Shop item deleted.", embeds: [], components: [] });
          return;
        }

        if (action === "toggle") {
          const updated = await shop.toggleItem(interaction.guildId, itemId);
          await interaction.update({ embeds: [shopItemEmbed(updated, interaction.member)], components: shopItemControls(updated, true) });
          return;
        }

        if (action === "discounts") {
          await showDiscountPanel(interaction, item);
          return;
        }

        if (action === "back") {
          await interaction.update({ embeds: [shopItemEmbed(item, interaction.member)], content: "", components: shopItemControls(item, true) });
          return;
        }
      }

      /* =====================
         SHOP EDIT MODAL
      ===================== */

      if (interaction.isModalSubmit() && interaction.customId.startsWith("shop_edit_modal_")) {
        const itemId = interaction.customId.replace("shop_edit_modal_", "");
        const updated = await shop.updateItem(interaction.guildId, itemId, {
          name: interaction.fields.getTextInputValue("name"),
          description: interaction.fields.getTextInputValue("description"),
          price: Math.max(0, Number(interaction.fields.getTextInputValue("price")) || 0),
          stock: Math.max(0, Number(interaction.fields.getTextInputValue("stock")) || 0),
          xpReward: Math.max(0, Number(interaction.fields.getTextInputValue("xp")) || 0)
        });
        await interaction.reply({ content: updated ? `✅ **${updated.name}** updated.` : "❌ Shop item not found.", flags: MessageFlags.Ephemeral });
        return;
      }

      /* =====================
         SHOP DISCOUNT ROLE SELECT
      ===================== */

      if (interaction.isButton() && interaction.customId.startsWith("shop_add_discount_")) {
        const itemId = interaction.customId.replace("shop_add_discount_", "");
        await interaction.reply({
          content: "Select the role that should receive a discount:",
          components: [
            new ActionRowBuilder().addComponents(
              new RoleSelectMenuBuilder()
                .setCustomId(`shop_discount_role_${itemId}`)
                .setPlaceholder("Select a role...")
                .setMinValues(1)
                .setMaxValues(1)
            )
          ],
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      if (interaction.isRoleSelectMenu() && interaction.customId.startsWith("shop_discount_role_")) {
        const itemId = interaction.customId.replace("shop_discount_role_", "");
        const roleId = interaction.values[0];
        const modal = new ModalBuilder()
          .setCustomId(`shop_discount_modal_${itemId}_${roleId}`)
          .setTitle("Role discount")
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId("percent")
                .setLabel("Discount percentage (0-100)")
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setValue("10")
            )
          );
        await interaction.showModal(modal);
        return;
      }

      if (interaction.isModalSubmit() && interaction.customId.startsWith("shop_discount_modal_")) {
        const parts = interaction.customId.split("_");
        const itemId = parts[3];
        const roleId = parts[4];
        const percent = Number(interaction.fields.getTextInputValue("percent"));
        if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
          await interaction.reply({ content: "Discount must be between 0 and 100.", flags: MessageFlags.Ephemeral });
          return;
        }
        const updated = await shop.setRoleDiscount(interaction.guildId, itemId, roleId, percent);
        await interaction.reply({ content: updated ? `✅ Role discount saved: **${percent}%**.` : "❌ Shop item not found.", flags: MessageFlags.Ephemeral });
        return;
      }

      if (interaction.isButton() && interaction.customId.startsWith("shop_remove_discount_")) {
        const itemId = interaction.customId.replace("shop_remove_discount_", "");
        const item = await shop.getItem(interaction.guildId, itemId);
        const discounts = shop.normalizeDiscounts(item?.roleDiscounts);
        if (!item || !discounts.length) {
          await interaction.reply({ content: "No role discounts are configured.", flags: MessageFlags.Ephemeral });
          return;
        }
        const options = discounts.map(discount => {
          const role = interaction.guild.roles.cache.get(discount.roleId);
          return {
            label: (role?.name || discount.roleId).slice(0, 100),
            value: discount.roleId,
            description: `${discount.percent}% discount`
          };
        });
        await interaction.reply({
          content: "Select the role discount to remove:",
          components: [new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`shop_remove_discount_select_${itemId}`).setPlaceholder("Select a role...").addOptions(options))],
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      if (interaction.isStringSelectMenu() && interaction.customId.startsWith("shop_remove_discount_select_")) {
        const itemId = interaction.customId.replace("shop_remove_discount_select_", "");
        const roleId = interaction.values[0];
        const updated = await shop.removeRoleDiscount(interaction.guildId, itemId, roleId);
        await interaction.update({ content: updated ? "✅ Role discount removed." : "❌ Shop item not found.", components: [] });
        return;
      }

      /* =====================
         GIVEAWAY ENTER
      ===================== */

      if (
        interaction.isButton() &&
        interaction.customId.startsWith(
          "giveaway_"
        ) &&
        !interaction.customId.startsWith(
          "giveaway_leave_"
        ) &&
        !interaction.customId.startsWith(
          "giveaway_keep_"
        ) &&
        !interaction.customId.startsWith(
          "giveaway_enter_again_"
        )
      ) {
        if (
          !(await checkButtonPermissions(
            interaction
          ))
        ) {
          return;
        }

        await interaction.deferReply({
          flags:
            MessageFlags.Ephemeral
        });

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
            type:
              "giveaway",
            finished:
              false
          });

        if (!giveaway) {
          await interaction.editReply({
            content:
              "This giveaway has already ended."
          });

          return;
        }

        const alreadyEntered =
          giveaway.entries?.includes(
            interaction.user.id
          );

        if (
          alreadyEntered
        ) {
          await interaction.editReply({
            content:
              "You are already entered in this giveaway.",
            components: [
              createGiveawayUserButtons(
                messageId
              )
            ]
          });

          return;
        }

        const updated =
          await collection.findOneAndUpdate(
            {
              messageId,
              type:
                "giveaway",
              finished:
                false,
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
              returnDocument:
                "after"
            }
          );

        if (!updated) {
          await interaction.editReply({
            content:
              "You could not enter the giveaway."
          });

          return;
        }

        const message =
          await getOriginalMessage(
            updated
          );

        if (message) {
          const embed =
            message.embeds[0]
              ? EmbedBuilder.from(
                  message.embeds[0]
                )
              : null;

          if (embed) {
            const entryField =
              embed.data.fields?.find(
                field =>
                  field.name ===
                  "ENTRIES"
              );

            if (
              entryField
            ) {
              entryField.value =
                String(
                  updated.entries
                    .length
                );
            }

            await message.edit({
              embeds: [
                embed
              ],
              components: [
                createGiveawayButton(
                  updated.messageId,
                  updated.entries
                    .length
                )
              ]
            });
          }
        }

        await interaction.editReply({
          content:
            `You entered the giveaway!\n\nYou are now one of ${updated.entries.length} ENTRIES.`,
          components: [
            createGiveawayUserButtons(
              messageId
            )
          ]
        });

        return;
      }

      /* =====================
         KEEP ME IN
      ===================== */

      if (
        interaction.isButton() &&
        interaction.customId.startsWith(
          "giveaway_keep_"
        )
      ) {
        if (
          !(await checkButtonPermissions(
            interaction
          ))
        ) {
          return;
        }

        const messageId =
          interaction.customId.replace(
            "giveaway_keep_",
            ""
          );

        const collection =
          getCollection();

        const giveaway =
          await collection.findOne({
            messageId,
            type:
              "giveaway",
            finished:
              false
          });

        if (!giveaway) {
          await interaction.reply({
            content:
              "This giveaway has already ended.",
            flags:
              MessageFlags.Ephemeral
          });

          return;
        }

        const isEntered =
          giveaway.entries?.includes(
            interaction.user.id
          );

        if (!isEntered) {
          await interaction.reply({
            content:
              "You are not currently entered in this giveaway.",
            flags:
              MessageFlags.Ephemeral
          });

          return;
        }

        await interaction.update({
          content:
            "✅ YOU ARE STILL IN!",
          components: []
        });

        return;
      }

      /* =====================
         GIVEAWAY LEAVE
      ===================== */

      if (
        interaction.isButton() &&
        interaction.customId.startsWith(
          "giveaway_leave_"
        )
      ) {
        if (
          !(await checkButtonPermissions(
            interaction
          ))
        ) {
          return;
        }

        await interaction.deferUpdate();

        const messageId =
          interaction.customId.replace(
            "giveaway_leave_",
            ""
          );

        const collection =
          getCollection();

        const giveaway =
          await collection.findOne({
            messageId,
            type:
              "giveaway",
            finished:
              false
          });

        if (!giveaway) {
          await interaction.editReply({
            content:
              "This giveaway has already ended.",
            components: []
          });

          return;
        }

        if (
          !giveaway.entries?.includes(
            interaction.user.id
          )
        ) {
          await interaction.editReply({
            content:
              "You are not currently entered in this giveaway.",
            components: [
              createEnterAgainButton(
                messageId
              )
            ]
          });

          return;
        }

        const updated =
          await collection.findOneAndUpdate(
            {
              messageId,
              type:
                "giveaway",
              finished:
                false,
              entries:
                interaction.user.id
            },
            {
              $pull: {
                entries:
                  interaction.user.id
              }
            },
            {
              returnDocument:
                "after"
            }
          );

        if (!updated) {
          await interaction.editReply({
            content:
              "You could not leave the giveaway.",
            components: []
          });

          return;
        }

        const message =
          await getOriginalMessage(
            updated
          );

        if (message) {
          const embed =
            message.embeds[0]
              ? EmbedBuilder.from(
                  message.embeds[0]
                )
              : null;

          if (embed) {
            const entryField =
              embed.data.fields?.find(
                field =>
                  field.name ===
                  "ENTRIES"
              );

            if (
              entryField
            ) {
              entryField.value =
                String(
                  updated.entries
                    .length
                );
            }

            await message.edit({
              embeds: [
                embed
              ],
              components: [
                createGiveawayButton(
                  updated.messageId,
                  updated.entries
                    .length
                )
              ]
            });
          }
        }

        await interaction.editReply({
          content:
            "You left the giveaway.",
          components: [
            createEnterAgainButton(
              messageId
            )
          ]
        });

        return;
      }

      /* =====================
         ENTER AGAIN
      ===================== */

      if (
        interaction.isButton() &&
        interaction.customId.startsWith(
          "giveaway_enter_again_"
        )
      ) {
        if (
          !(await checkButtonPermissions(
            interaction
          ))
        ) {
          return;
        }

        await interaction.deferReply({
          flags:
            MessageFlags.Ephemeral
        });

        const messageId =
          interaction.customId.replace(
            "giveaway_enter_again_",
            ""
          );

        const collection =
          getCollection();

        const giveaway =
          await collection.findOne({
            messageId,
            type:
              "giveaway",
            finished:
              false
          });

        if (!giveaway) {
          await interaction.editReply({
            content:
              "This giveaway has already ended.",
            components: []
          });

          return;
        }

        if (
          giveaway.entries?.includes(
            interaction.user.id
          )
        ) {
          await interaction.editReply({
            content:
              "You are already entered in this giveaway.",
            components: [
              createGiveawayUserButtons(
                messageId
              )
            ]
          });

          return;
        }

        const updated =
          await collection.findOneAndUpdate(
            {
              messageId,
              type:
                "giveaway",
              finished:
                false,
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
              returnDocument:
                "after"
            }
          );

        if (!updated) {
          await interaction.editReply({
            content:
              "You could not enter the giveaway."
          });

          return;
        }

        const message =
          await getOriginalMessage(
            updated
          );

        if (message) {
          const embed =
            message.embeds[0]
              ? EmbedBuilder.from(
                  message.embeds[0]
                )
              : null;

          if (embed) {
            const entryField =
              embed.data.fields?.find(
                field =>
                  field.name ===
                  "ENTRIES"
              );

            if (
              entryField
            ) {
              entryField.value =
                String(
                  updated.entries
                    .length
                );
            }

            await message.edit({
              embeds: [
                embed
              ],
              components: [
                createGiveawayButton(
                  updated.messageId,
                  updated.entries
                    .length
                )
              ]
            });
          }
        }

        await interaction.editReply({
          content:
            `You entered the giveaway again!\n\nYou are now one of ${updated.entries.length} ENTRIES.`,
          components: [
            createGiveawayUserButtons(
              messageId
            )
          ]
        });

        return;
      }

      /* =====================
         DROP BUTTON
      ===================== */

      if (
        interaction.isButton() &&
        interaction.customId.startsWith(
          "drop_"
        )
      ) {
        if (
          !(await checkButtonPermissions(
            interaction
          ))
        ) {
          return;
        }

        await interaction.deferReply({
          flags:
            MessageFlags.Ephemeral
        });

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
            type:
              "drop",
            finished:
              false
          });

        if (!drop) {
          await interaction.editReply({
            content:
              "This drop has already ended."
          });

          return;
        }

        const claimed =
          await claimDrop(
            drop,
            interaction.user.id
          );

        if (claimed) {
          await interaction.editReply({
            content:
              "🎉 You won the drop!"
          });
        } else {
          await interaction.editReply({
            content:
              "Someone else already claimed the drop."
          });
        }

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
        if (
          !(await checkButtonPermissions(
            interaction
          ))
        ) {
          return;
        }

        await interaction.deferUpdate();

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

      try {
        if (
          interaction.replied ||
          interaction.deferred
        ) {
          await interaction.editReply({
            content:
              "An error occurred while processing the request.",
            components: []
          });
        } else {
          await interaction.reply({
            content:
              "An error occurred while processing the request.",
            flags:
              MessageFlags.Ephemeral
          });
        }
      } catch {}
    }
  }
);


/* =========================
   MESSAGE XP
========================= */

client.on("messageCreate", async message => {
  try {
    const result = await economy.awardMessageXp(message);
    if (result?.leveledUp) {
      await message.channel.send(
        `⭐ <@${message.author.id}> reached **Level ${result.newLevel}**!`
      );
    }
  } catch (error) {
    console.error("Message XP error:", error);
  }
});

/* =========================
   LOGIN
========================= */

client.login(TOKEN);
