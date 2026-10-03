const { ObjectId } = require("mongodb");

const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  RoleSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  PermissionFlagsBits,
  MessageFlags
} = require("discord.js");

const { getDatabase } = require("./database");
const {
  getAccount,
  ensureAccount
} = require("./economy");

function getItemsCollection() {
  return getDatabase().collection("shop_items");
}

function getPurchasesCollection() {
  return getDatabase().collection("shop_purchases");
}

function getPurchaseLimitsCollection() {
  return getDatabase().collection("shop_purchase_limits");
}

function getItemId(id) {
  if (!ObjectId.isValid(id)) {
    return null;
  }

  return new ObjectId(id);
}

function isManager(interaction) {
  return interaction.memberPermissions?.has(
    PermissionFlagsBits.ManageGuild
  );
}

function safeText(value, fallback = "Not specified") {
  if (
    value === undefined ||
    value === null ||
    String(value).trim() === ""
  ) {
    return fallback;
  }

  return String(value);
}

function calculateDiscount(member, roleDiscounts = []) {
  const discounts = [];

  for (const discount of roleDiscounts) {
    if (!discount?.roleId) {
      continue;
    }

    if (!member.roles.cache.has(discount.roleId)) {
      continue;
    }

    const percentage = Number(discount.percentage);

    if (
      Number.isFinite(percentage) &&
      percentage > 0
    ) {
      discounts.push(percentage);
    }
  }

  discounts.sort((a, b) => b - a);

  const highestTwo = discounts.slice(0, 2);

  return Math.min(
    100,
    highestTwo.reduce(
      (total, value) => total + value,
      0
    )
  );
}

function calculatePrice(price, discount) {
  return Math.max(
    0,
    Math.floor(
      Number(price) * (100 - discount) / 100
    )
  );
}

function formatCoins(amount) {
  return `${Number(amount).toLocaleString()} Coins`;
}

function createItemEmbed(item, member = null) {
  const discount = member
    ? calculateDiscount(member, item.roleDiscounts || [])
    : 0;

  const finalPrice = calculatePrice(
    item.price,
    discount
  );

  const stockText =
    item.stock === 0
      ? "Unlimited"
      : String(item.stock);

  const limitText =
    item.purchaseLimit === 0
      ? "Unlimited"
      : String(item.purchaseLimit);

  const roleText = item.requiredRoleId
    ? `<@&${item.requiredRoleId}>`
    : "None";

  const embed = new EmbedBuilder()
    .setTitle(
      `${item.emoji || "🛒"} ${item.name}`
    )
    .setDescription(
      safeText(
        item.description,
        "No description provided."
      )
    )
    .addFields(
      {
        name: "💰 Price",
        value:
          discount > 0
            ? `~~${formatCoins(item.price)}~~ ${formatCoins(finalPrice)}`
            : formatCoins(item.price),
        inline: true
      },
      {
        name: "📦 Stock",
        value: stockText,
        inline: true
      },
      {
        name: "🏷️ Category",
        value: safeText(item.category, "General"),
        inline: true
      },
      {
        name: "🔢 Purchase Limit",
        value: limitText,
        inline: true
      },
      {
        name: "👤 Required Role",
        value: roleText,
        inline: true
      },
      {
        name: "⚡ Status",
        value: item.enabled ? "Enabled" : "Disabled",
        inline: true
      }
    )
    .setFooter({
      text:
        discount > 0
          ? `Your role discount: ${discount}%`
          : "No role discount"
    });

  return embed;
}

function createShopButtons(item, manager) {
  const buttons = [];

  if (item.enabled) {
    buttons.push(
      new ButtonBuilder()
        .setCustomId(`shop_buy:${item._id}`)
        .setLabel("🛒 BUY")
        .setStyle(ButtonStyle.Success)
    );
  }

  if (manager) {
    buttons.push(
      new ButtonBuilder()
        .setCustomId(`shop_manage:${item._id}`)
        .setLabel("⚙️ MANAGE")
        .setStyle(ButtonStyle.Secondary)
    );
  }

  return new ActionRowBuilder().addComponents(buttons);
}

function createManagerButtons(item) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`shop_edit:${item._id}`)
      .setLabel("✏️ EDIT")
      .setStyle(ButtonStyle.Primary),

    new ButtonBuilder()
      .setCustomId(`shop_delete_confirm:${item._id}`)
      .setLabel("🗑️ DELETE")
      .setStyle(ButtonStyle.Danger),

    new ButtonBuilder()
      .setCustomId(`shop_toggle:${item._id}`)
      .setLabel(
        item.enabled
          ? "🔴 DISABLE"
          : "🟢 ENABLE"
      )
      .setStyle(
        item.enabled
          ? ButtonStyle.Danger
          : ButtonStyle.Success
      )
  );
}

function createDiscountButtons(item) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`shop_add_discount:${item._id}`)
      .setLabel("➕ ADD ROLE DISCOUNT")
      .setStyle(ButtonStyle.Success),

    new ButtonBuilder()
      .setCustomId(`shop_manage_discounts:${item._id}`)
      .setLabel("⚙️ MANAGE DISCOUNTS")
      .setStyle(ButtonStyle.Secondary)
  );
}

async function findItem(guildId, itemId) {
  const collection = getItemsCollection();

  const objectId = getItemId(itemId);

  if (!objectId) {
    return null;
  }

  return collection.findOne({
    _id: objectId,
    guildId
  });
}

async function findItemByName(guildId, name) {
  const collection = getItemsCollection();

  return collection.findOne({
    guildId,
    nameLower: String(name).trim().toLowerCase()
  });
}

async function createShopItem(interaction) {
  const guildId = interaction.guildId;

  const name = interaction.options
    .getString("name", true)
    .trim();

  const description = interaction.options
    .getString("description", true)
    .trim();

  const price = interaction.options.getInteger(
    "price",
    true
  );

  const stock =
    interaction.options.getInteger("stock") ?? 0;

  const category =
    interaction.options.getString("category") ||
    "General";

  const emoji =
    interaction.options.getString("emoji") ||
    "🛒";

  const purchaseLimit =
    interaction.options.getInteger(
      "purchase_limit"
    ) ?? 0;

  const requiredRole =
    interaction.options.getRole("required_role");

  const existing = await findItemByName(
    guildId,
    name
  );

  if (existing) {
    await interaction.reply({
      content:
        "❌ An item with that name already exists.",
      flags: MessageFlags.Ephemeral
    });

    return;
  }

  const collection = getItemsCollection();

  const item = {
    guildId,
    name,
    nameLower: name.toLowerCase(),
    description,
    price,
    stock,
    category,
    emoji,
    purchaseLimit,
    requiredRoleId:
      requiredRole?.id || null,
    roleDiscounts: [],
    enabled: true,
    createdBy: interaction.user.id,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };

  const result = await collection.insertOne(item);

  item._id = result.insertedId;

  await interaction.reply({
    content: "✅ Shop item created successfully.",
    embeds: [
      createItemEmbed(item)
    ],
    components: [
      createManagerButtons(item),
      createDiscountButtons(item)
    ],
    flags: MessageFlags.Ephemeral
  });
}

async function showShop(interaction) {
  const collection = getItemsCollection();

  const items = await collection
    .find({
      guildId: interaction.guildId
    })
    .sort({
      category: 1,
      createdAt: 1
    })
    .toArray();

  if (!items.length) {
    await interaction.reply({
      content: "🛒 The shop is currently empty.",
      flags: MessageFlags.Ephemeral
    });

    return;
  }

  const manager = isManager(interaction);

  const visibleItems = items.filter(
    (item) =>
      item.enabled ||
      manager
  );

  if (!visibleItems.length) {
    await interaction.reply({
      content: "🛒 The shop is currently empty.",
      flags: MessageFlags.Ephemeral
    });

    return;
  }

  const messages = [];

  for (const item of visibleItems) {
    messages.push({
      embeds: [
        createItemEmbed(
          item,
          interaction.member
        )
      ],
      components: [
        createShopButtons(
          item,
          manager
        )
      ]
    });
  }

  await interaction.reply({
    content:
      `🛒 **${interaction.guild.name} Shop**`,
    flags: MessageFlags.Ephemeral
  });

  for (const message of messages) {
    await interaction.followUp({
      ...message,
      flags: MessageFlags.Ephemeral
    });
  }
}

async function editItemFromCommand(interaction) {
  const itemName = interaction.options.getString(
    "item",
    true
  );

  const item = await findItemByName(
    interaction.guildId,
    itemName
  );

  if (!item) {
    await interaction.reply({
      content: "❌ Shop item not found.",
      flags: MessageFlags.Ephemeral
    });

    return;
  }

  const collection = getItemsCollection();

  const updates = {};

  const name = interaction.options.getString("name");
  const description =
    interaction.options.getString("description");
  const price =
    interaction.options.getInteger("price");
  const stock =
    interaction.options.getInteger("stock");
  const category =
    interaction.options.getString("category");
  const emoji =
    interaction.options.getString("emoji");
  const purchaseLimit =
    interaction.options.getInteger(
      "purchase_limit"
    );

  if (name !== null) {
    const trimmedName = name.trim();

    const duplicate = await collection.findOne({
      guildId: interaction.guildId,
      nameLower: trimmedName.toLowerCase(),
      _id: {
        $ne: item._id
      }
    });

    if (duplicate) {
      await interaction.reply({
        content:
          "❌ Another item already uses that name.",
        flags: MessageFlags.Ephemeral
      });

      return;
    }

    updates.name = trimmedName;
    updates.nameLower =
      trimmedName.toLowerCase();
  }

  if (description !== null) {
    updates.description =
      description.trim();
  }

  if (price !== null) {
    updates.price = price;
  }

  if (stock !== null) {
    updates.stock = stock;
  }

  if (category !== null) {
    updates.category =
      category.trim();
  }

  if (emoji !== null) {
    updates.emoji =
      emoji.trim();
  }

  if (purchaseLimit !== null) {
    updates.purchaseLimit =
      purchaseLimit;
  }

  if (!Object.keys(updates).length) {
    await interaction.reply({
      content:
        "❌ You didn't provide anything to edit.",
      flags: MessageFlags.Ephemeral
    });

    return;
  }

  updates.updatedAt = Date.now();

  await collection.updateOne(
    {
      _id: item._id,
      guildId: interaction.guildId
    },
    {
      $set: updates
    }
  );

  const updated = await findItem(
    interaction.guildId,
    item._id.toString()
  );

  await interaction.reply({
    content: "✅ Shop item updated.",
    embeds: [
      createItemEmbed(updated)
    ],
    components: [
      createManagerButtons(updated),
      createDiscountButtons(updated)
    ],
    flags: MessageFlags.Ephemeral
  });
}

async function toggleItem(interaction, itemId) {
  const item = await findItem(
    interaction.guildId,
    itemId
  );

  if (!item) {
    await interaction.reply({
      content: "❌ Shop item not found.",
      flags: MessageFlags.Ephemeral
    });

    return;
  }

  const collection = getItemsCollection();

  await collection.updateOne(
    {
      _id: item._id,
      guildId: interaction.guildId
    },
    {
      $set: {
        enabled: !item.enabled,
        updatedAt: Date.now()
      }
    }
  );

  const updated = await findItem(
    interaction.guildId,
    itemId
  );

  await interaction.update({
    content: updated.enabled
      ? "🟢 Shop item enabled."
      : "🔴 Shop item disabled.",
    embeds: [
      createItemEmbed(updated)
    ],
    components: [
      createManagerButtons(updated),
      createDiscountButtons(updated)
    ]
  });
}

async function deleteItem(interaction, itemId) {
  const item = await findItem(
    interaction.guildId,
    itemId
  );

  if (!item) {
    await interaction.update({
      content: "❌ Shop item not found.",
      embeds: [],
      components: []
    });

    return;
  }

  const collection = getItemsCollection();

  await collection.deleteOne({
    _id: item._id,
    guildId: interaction.guildId
  });

  await interaction.update({
    content:
      `🗑️ **${item.name}** was deleted from the shop.`,
    embeds: [],
    components: []
  });
}

async function showDeleteConfirmation(
  interaction,
  itemId
) {
  const item = await findItem(
    interaction.guildId,
    itemId
  );

  if (!item) {
    await interaction.reply({
      content: "❌ Shop item not found.",
      flags: MessageFlags.Ephemeral
    });

    return;
  }

  const row = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(
          `shop_delete:${item._id}`
        )
        .setLabel("YES, DELETE")
        .setStyle(ButtonStyle.Danger),

      new ButtonBuilder()
        .setCustomId(
          `shop_manage:${item._id}`
        )
        .setLabel("CANCEL")
        .setStyle(ButtonStyle.Secondary)
    );

  await interaction.update({
    content:
      `⚠️ Are you sure you want to delete **${item.name}**?`,
    embeds: [],
    components: [row]
  });
}

async function showManagerPanel(
  interaction,
  itemId
) {
  const item = await findItem(
    interaction.guildId,
    itemId
  );

  if (!item) {
    await interaction.reply({
      content: "❌ Shop item not found.",
      flags: MessageFlags.Ephemeral
    });

    return;
  }

  await interaction.update({
    content:
      `⚙️ Managing **${item.name}**`,
    embeds: [
      createItemEmbed(item)
    ],
    components: [
      createManagerButtons(item),
      createDiscountButtons(item)
    ]
  });
}

async function showEditModal(
  interaction,
  itemId
) {
  const item = await findItem(
    interaction.guildId,
    itemId
  );

  if (!item) {
    await interaction.reply({
      content: "❌ Shop item not found.",
      flags: MessageFlags.Ephemeral
    });

    return;
  }

  const modal = new ModalBuilder()
    .setCustomId(
      `shop_edit_modal:${item._id}`
    )
    .setTitle("Edit Shop Item");

  const nameInput =
    new TextInputBuilder()
      .setCustomId("name")
      .setLabel("Name")
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMaxLength(100)
      .setValue(item.name);

  const descriptionInput =
    new TextInputBuilder()
      .setCustomId("description")
      .setLabel("Description")
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true)
      .setMaxLength(1000)
      .setValue(item.description);

  const priceInput =
    new TextInputBuilder()
      .setCustomId("price")
      .setLabel("Price")
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setValue(String(item.price));

  const stockInput =
    new TextInputBuilder()
      .setCustomId("stock")
      .setLabel("Stock (0 = unlimited)")
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setValue(String(item.stock));

  const categoryInput =
    new TextInputBuilder()
      .setCustomId("category")
      .setLabel("Category")
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setValue(item.category);

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      nameInput
    ),
    new ActionRowBuilder().addComponents(
      descriptionInput
    ),
    new ActionRowBuilder().addComponents(
      priceInput
    ),
    new ActionRowBuilder().addComponents(
      stockInput
    ),
    new ActionRowBuilder().addComponents(
      categoryInput
    )
  );

  await interaction.showModal(modal);
}

async function saveModalEdit(interaction, itemId) {
  const item = await findItem(
    interaction.guildId,
    itemId
  );

  if (!item) {
    await interaction.reply({
      content: "❌ Shop item not found.",
      flags: MessageFlags.Ephemeral
    });

    return;
  }

  const name = interaction.fields
    .getTextInputValue("name")
    .trim();

  const description = interaction.fields
    .getTextInputValue("description")
    .trim();

  const price = Number(
    interaction.fields
      .getTextInputValue("price")
  );

  const stock = Number(
    interaction.fields
      .getTextInputValue("stock")
  );

  const category = interaction.fields
    .getTextInputValue("category")
    .trim();

  if (
    !name ||
    !description ||
    !category ||
    !Number.isInteger(price) ||
    price < 0 ||
    !Number.isInteger(stock) ||
    stock < 0
  ) {
    await interaction.reply({
      content:
        "❌ Invalid values. Price and stock must be whole numbers and cannot be negative.",
      flags: MessageFlags.Ephemeral
    });

    return;
  }

  const collection = getItemsCollection();

  const duplicate = await collection.findOne({
    guildId: interaction.guildId,
    nameLower: name.toLowerCase(),
    _id: {
      $ne: item._id
    }
  });

  if (duplicate) {
    await interaction.reply({
      content:
        "❌ Another item already uses that name.",
      flags: MessageFlags.Ephemeral
    });

    return;
  }

  await collection.updateOne(
    {
      _id: item._id,
      guildId: interaction.guildId
    },
    {
      $set: {
        name,
        nameLower: name.toLowerCase(),
        description,
        price,
        stock,
        category,
        updatedAt: Date.now()
      }
    }
  );

  const updated = await findItem(
    interaction.guildId,
    itemId
  );

  await interaction.reply({
    content:
      "✅ Shop item updated successfully.",
    embeds: [
      createItemEmbed(updated)
    ],
    components: [
      createManagerButtons(updated),
      createDiscountButtons(updated)
    ],
    flags: MessageFlags.Ephemeral
  });
}

async function showRoleDiscountSelector(
  interaction,
  itemId
) {
  const item = await findItem(
    interaction.guildId,
    itemId
  );

  if (!item) {
    await interaction.reply({
      content: "❌ Shop item not found.",
      flags: MessageFlags.Ephemeral
    });

    return;
  }

  const menu = new RoleSelectMenuBuilder()
    .setCustomId(
      `shop_discount_role:${item._id}`
    )
    .setPlaceholder(
      "Select a role for the discount"
    )
    .setMinValues(1)
    .setMaxValues(1);

  const row = new ActionRowBuilder()
    .addComponents(menu);

  await interaction.reply({
    content:
      "🎟️ Select the role that should receive a discount.",
    components: [row],
    flags: MessageFlags.Ephemeral
  });
}

async function showDiscountModal(
  interaction,
  itemId,
  roleId
) {
  const role = interaction.guild.roles.cache.get(
    roleId
  );

  if (!role) {
    await interaction.update({
      content:
        "❌ That role no longer exists.",
      components: []
    });

    return;
  }

  const modal = new ModalBuilder()
    .setCustomId(
      `shop_discount_modal:${itemId}:${roleId}`
    )
    .setTitle("Role Discount");

  const discountInput =
    new TextInputBuilder()
      .setCustomId("discount")
      .setLabel(
        `Discount for ${role.name}`
      )
      .setStyle(TextInputStyle.Short)
      .setPlaceholder("Example: 15")
      .setRequired(true)
      .setMinLength(1)
      .setMaxLength(3);

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      discountInput
    )
  );

  await interaction.showModal(modal);
}

async function saveRoleDiscount(
  interaction,
  itemId,
  roleId
) {
  const item = await findItem(
    interaction.guildId,
    itemId
  );

  if (!item) {
    await interaction.reply({
      content: "❌ Shop item not found.",
      flags: MessageFlags.Ephemeral
    });

    return;
  }

  const discount = Number(
    interaction.fields
      .getTextInputValue("discount")
  );

  if (
    !Number.isInteger(discount) ||
    discount < 1 ||
    discount > 100
  ) {
    await interaction.reply({
      content:
        "❌ Discount must be a whole number between 1 and 100.",
      flags: MessageFlags.Ephemeral
    });

    return;
  }

  const role = interaction.guild.roles.cache.get(
    roleId
  );

  if (!role) {
    await interaction.reply({
      content:
        "❌ That role no longer exists.",
      flags: MessageFlags.Ephemeral
    });

    return;
  }

  const discounts = [
    ...(item.roleDiscounts || [])
  ];

  const existingIndex =
    discounts.findIndex(
      (entry) =>
        entry.roleId === roleId
    );

  const newDiscount = {
    roleId,
    percentage: discount
  };

  if (existingIndex >= 0) {
    discounts[existingIndex] =
      newDiscount;
  } else {
    discounts.push(newDiscount);
  }

  const collection = getItemsCollection();

  await collection.updateOne(
    {
      _id: item._id,
      guildId: interaction.guildId
    },
    {
      $set: {
        roleDiscounts: discounts,
        updatedAt: Date.now()
      }
    }
  );

  const updated = await findItem(
    interaction.guildId,
    itemId
  );

  await interaction.reply({
    content:
      `✅ ${role} now has a **${discount}%** discount.\n\nYou can add another role discount below.`,
    embeds: [
      createItemEmbed(updated)
    ],
    components: [
      createDiscountButtons(updated),
      createManagerButtons(updated)
    ],
    flags: MessageFlags.Ephemeral
  });
}

async function showDiscountManager(
  interaction,
  itemId
) {
  const item = await findItem(
    interaction.guildId,
    itemId
  );

  if (!item) {
    await interaction.reply({
      content: "❌ Shop item not found.",
      flags: MessageFlags.Ephemeral
    });

    return;
  }

  const discounts =
    item.roleDiscounts || [];

  if (!discounts.length) {
    await interaction.reply({
      content:
        "🎟️ This item has no role discounts yet.",
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(
              `shop_add_discount:${item._id}`
            )
            .setLabel("➕ ADD ROLE DISCOUNT")
            .setStyle(ButtonStyle.Success),

          new ButtonBuilder()
            .setCustomId(
              `shop_manage:${item._id}`
            )
            .setLabel("BACK")
            .setStyle(ButtonStyle.Secondary)
        )
      ],
      flags: MessageFlags.Ephemeral
    });

    return;
  }

  const options = [];

  for (const discount of discounts.slice(0, 25)) {
    const role =
      interaction.guild.roles.cache.get(
        discount.roleId
      );

    options.push({
      label: role
        ? role.name.slice(0, 100)
        : `Deleted role ${discount.roleId}`,
      description:
        `${discount.percentage}% discount`,
      value: discount.roleId
    });
  }

  const menu =
    new StringSelectMenuBuilder()
      .setCustomId(
        `shop_discount_manage_select:${item._id}`
      )
      .setPlaceholder(
        "Select a role discount to manage"
      )
      .addOptions(options);

  const row =
    new ActionRowBuilder()
      .addComponents(menu);

  await interaction.reply({
    content:
      "🎟️ Select a role discount to change or remove it.",
    components: [
      row
    ],
    flags: MessageFlags.Ephemeral
  });
}

async function showDiscountActions(
  interaction,
  itemId,
  roleId
) {
  const item = await findItem(
    interaction.guildId,
    itemId
  );

  if (!item) {
    await interaction.reply({
      content: "❌ Shop item not found.",
      flags: MessageFlags.Ephemeral
    });

    return;
  }

  const discount =
    (item.roleDiscounts || []).find(
      (entry) =>
        entry.roleId === roleId
    );

  if (!discount) {
    await interaction.update({
      content:
        "❌ That role discount no longer exists.",
      components: []
    });

    return;
  }

  const role =
    interaction.guild.roles.cache.get(
      roleId
    );

  const row =
    new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(
            `shop_change_discount:${item._id}:${roleId}`
          )
          .setLabel(
            `✏️ CHANGE ${discount.percentage}%`
          )
          .setStyle(ButtonStyle.Primary),

        new ButtonBuilder()
          .setCustomId(
            `shop_remove_discount:${item._id}:${roleId}`
          )
          .setLabel("🗑️ REMOVE")
          .setStyle(ButtonStyle.Danger),

        new ButtonBuilder()
          .setCustomId(
            `shop_manage:${item._id}`
          )
          .setLabel("BACK")
          .setStyle(ButtonStyle.Secondary)
      );

  await interaction.update({
    content:
      `🎟️ Discount for ${role || roleId}: **${discount.percentage}%**`,
    components: [row]
  });
}

async function removeRoleDiscount(
  interaction,
  itemId,
  roleId
) {
  const item = await findItem(
    interaction.guildId,
    itemId
  );

  if (!item) {
    await interaction.reply({
      content: "❌ Shop item not found.",
      flags: MessageFlags.Ephemeral
    });

    return;
  }

  const discounts =
    (item.roleDiscounts || []).filter(
      (entry) =>
        entry.roleId !== roleId
    );

  const collection = getItemsCollection();

  await collection.updateOne(
    {
      _id: item._id,
      guildId: interaction.guildId
    },
    {
      $set: {
        roleDiscounts: discounts,
        updatedAt: Date.now()
      }
    }
  );

  const updated = await findItem(
    interaction.guildId,
    itemId
  );

  await interaction.update({
    content:
      "🗑️ Role discount removed.",
    embeds: [
      createItemEmbed(updated)
    ],
    components: [
      createManagerButtons(updated),
      createDiscountButtons(updated)
    ]
  });
}

async function purchaseItem(
  interaction,
  itemId
) {
  const item = await findItem(
    interaction.guildId,
    itemId
  );

  if (!item) {
    await interaction.reply({
      content:
        "❌ This shop item no longer exists.",
      flags: MessageFlags.Ephemeral
    });

    return;
  }

  if (!item.enabled) {
    await interaction.reply({
      content:
        "❌ This item is currently disabled.",
      flags: MessageFlags.Ephemeral
    });

    return;
  }

  if (
    item.requiredRoleId &&
    !interaction.member.roles.cache.has(
      item.requiredRoleId
    )
  ) {
    await interaction.reply({
      content:
        `❌ You need <@&${item.requiredRoleId}> to purchase this item.`,
      flags: MessageFlags.Ephemeral
    });

    return;
  }

  const discount = calculateDiscount(
    interaction.member,
    item.roleDiscounts || []
  );

  const finalPrice = calculatePrice(
    item.price,
    discount
  );

  await ensureAccount(
    interaction.guildId,
    interaction.user.id
  );

  const account = await getAccount(
    interaction.guildId,
    interaction.user.id
  );

  if (account.coins < finalPrice) {
    await interaction.reply({
      content:
        `❌ You need **${formatCoins(finalPrice)}**, but you only have **${formatCoins(account.coins)}**.`,
      flags: MessageFlags.Ephemeral
    });

    return;
  }

  const limits =
    getPurchaseLimitsCollection();

  if (item.purchaseLimit > 0) {
    await limits.updateOne(
      {
        guildId: interaction.guildId,
        itemId: item._id.toString(),
        userId: interaction.user.id
      },
      {
        $setOnInsert: {
          guildId: interaction.guildId,
          itemId: item._id.toString(),
          userId: interaction.user.id,
          count: 0,
          createdAt: Date.now()
        }
      },
      {
        upsert: true
      }
    );

    const reserved =
      await limits.findOneAndUpdate(
        {
          guildId: interaction.guildId,
          itemId: item._id.toString(),
          userId: interaction.user.id,
          count: {
            $lt: item.purchaseLimit
          }
        },
        {
          $inc: {
            count: 1
          },
          $set: {
            updatedAt: Date.now()
          }
        },
        {
          returnDocument: "after"
        }
      );

    if (!reserved) {
      await interaction.reply({
        content:
          `❌ You reached the purchase limit for **${item.name}**.`,
        flags: MessageFlags.Ephemeral
      });

      return;
    }
  }

  const economy =
    getDatabase().collection(
      "economy_users"
    );

  const charged =
    await economy.findOneAndUpdate(
      {
        guildId: interaction.guildId,
        userId: interaction.user.id,
        coins: {
          $gte: finalPrice
        }
      },
      {
        $inc: {
          coins: -finalPrice
        }
      },
      {
        returnDocument: "after"
      }
    );

  if (!charged) {
    if (item.purchaseLimit > 0) {
      await limits.updateOne(
        {
          guildId: interaction.guildId,
          itemId: item._id.toString(),
          userId: interaction.user.id,
          count: {
            $gt: 0
          }
        },
        {
          $inc: {
            count: -1
          }
        }
      );
    }

    await interaction.reply({
      content:
        "❌ You don't have enough Coins.",
      flags: MessageFlags.Ephemeral
    });

    return;
  }

  let stockReserved = false;

  if (item.stock > 0) {
    const stockResult =
      await getItemsCollection().findOneAndUpdate(
        {
          _id: item._id,
          guildId: interaction.guildId,
          stock: {
            $gt: 0
          }
        },
        {
          $inc: {
            stock: -1
          }
        },
        {
          returnDocument: "after"
        }
      );

    if (!stockResult) {
      await economy.updateOne(
        {
          guildId: interaction.guildId,
          userId: interaction.user.id
        },
        {
          $inc: {
            coins: finalPrice
          }
        }
      );

      if (item.purchaseLimit > 0) {
        await limits.updateOne(
          {
            guildId: interaction.guildId,
            itemId: item._id.toString(),
            userId: interaction.user.id,
            count: {
              $gt: 0
            }
          },
          {
            $inc: {
              count: -1
            }
          }
        );
      }

      await interaction.reply({
        content:
          "❌ This item just went out of stock.",
        flags: MessageFlags.Ephemeral
      });

      return;
    }

    stockReserved = true;
  }

  try {
    await getPurchasesCollection().insertOne({
      guildId: interaction.guildId,
      itemId: item._id.toString(),
      itemName: item.name,
      userId: interaction.user.id,
      username: interaction.user.username,
      originalPrice: item.price,
      discount,
      finalPrice,
      purchasedAt: Date.now()
    });
  } catch (error) {
    console.error(
      "Shop purchase record failed:",
      error
    );

    await economy.updateOne(
      {
        guildId: interaction.guildId,
        userId: interaction.user.id
      },
      {
        $inc: {
          coins: finalPrice
        }
      }
    );

    if (stockReserved) {
      await getItemsCollection().updateOne(
        {
          _id: item._id,
          guildId: interaction.guildId
        },
        {
          $inc: {
            stock: 1
          }
        }
      );
    }

    if (item.purchaseLimit > 0) {
      await limits.updateOne(
        {
          guildId: interaction.guildId,
          itemId: item._id.toString(),
          userId: interaction.user.id,
          count: {
            $gt: 0
          }
        },
        {
          $inc: {
            count: -1
          }
        }
      );
    }

    await interaction.reply({
      content:
        "❌ The purchase could not be completed. Your Coins were returned.",
      flags: MessageFlags.Ephemeral
    });

    return;
  }

  const updatedAccount =
    await getAccount(
      interaction.guildId,
      interaction.user.id
    );

  await interaction.reply({
    content:
      `✅ You purchased **${item.name}** for **${formatCoins(finalPrice)}**!\n` +
      `💰 Your remaining balance: **${formatCoins(updatedAccount.coins)}**`,
    flags: MessageFlags.Ephemeral
  });

  const channelEmbed =
    new EmbedBuilder()
      .setTitle("🛒 SHOP PURCHASE")
      .setDescription(
        `🎉 ${interaction.user} purchased **${item.name}**!`
      )
      .addFields(
        {
          name: "💰 Price Paid",
          value: formatCoins(finalPrice),
          inline: true
        },
        {
          name: "🏷️ Discount",
          value: `${discount}%`,
          inline: true
        }
      );

  try {
    await interaction.channel.send({
      embeds: [channelEmbed]
    });
  } catch (error) {
    console.error(
      "Failed to send shop announcement:",
      error
    );
  }

  try {
    await interaction.user.send({
      embeds: [
        new EmbedBuilder()
          .setTitle("🛒 Purchase Successful")
          .setDescription(
            `You purchased **${item.name}** in **${interaction.guild.name}**.`
          )
          .addFields(
            {
              name: "💰 Price Paid",
              value: formatCoins(finalPrice),
              inline: true
            },
            {
              name: "🏷️ Discount",
              value: `${discount}%`,
              inline: true
            },
            {
              name: "💰 Remaining Coins",
              value:
                formatCoins(
                  updatedAccount.coins
                ),
              inline: true
            }
          )
      ]
    });
  } catch (error) {
    console.error(
      "Failed to DM buyer:",
      error
    );
  }

  await notifyManagers(
    interaction.guild,
    item,
    interaction.user,
    finalPrice,
    discount
  );
}

async function notifyManagers(
  guild,
  item,
  buyer,
  finalPrice,
  discount
) {
  try {
    const members =
      await guild.members.fetch();

    const managers =
      members.filter(
        (member) =>
          member.permissions.has(
            PermissionFlagsBits.ManageGuild
          )
      );

    const embed =
      new EmbedBuilder()
        .setTitle("🛒 NEW SHOP PURCHASE")
        .setDescription(
          `${buyer} purchased **${item.name}**.`
        )
        .addFields(
          {
            name: "Buyer",
            value: `${buyer}`,
            inline: true
          },
          {
            name: "Price",
            value: formatCoins(finalPrice),
            inline: true
          },
          {
            name: "Discount",
            value: `${discount}%`,
            inline: true
          }
        );

    for (const [, manager] of managers) {
      if (manager.user.bot) {
        continue;
      }

      try {
        await manager.send({
          embeds: [embed]
        });
      } catch (error) {
        console.error(
          `Could not DM manager ${manager.user.tag}:`,
          error
        );
      }
    }
  } catch (error) {
    console.error(
      "Failed to notify managers:",
      error
    );
  }
}

async function showBalance(interaction) {
  const user =
    interaction.options.getUser("user") ||
    interaction.user;

  const account =
    await getAccount(
      interaction.guildId,
      user.id
    );

  const embed =
    new EmbedBuilder()
      .setTitle("💰 Balance")
      .setDescription(
        `${user} has **${formatCoins(account.coins)}**.`
      );

  await interaction.reply({
    embeds: [embed],
    flags: MessageFlags.Ephemeral
  });
}

async function showLevel(interaction) {
  const user =
    interaction.options.getUser("user") ||
    interaction.user;

  const account =
    await getAccount(
      interaction.guildId,
      user.id
    );

  const {
    levelFromXp,
    xpForLevel,
    getXpSettings
  } = require("./economy");

  const level =
    levelFromXp(account.xp);

  const currentLevelXp =
    xpForLevel(level);

  const nextLevelXp =
    xpForLevel(level + 1);

  const progress =
    account.xp - currentLevelXp;

  const needed =
    nextLevelXp - currentLevelXp;

  const settings =
    await getXpSettings(
      interaction.guildId
    );

  const messagesRequired =
    account.xpMessagesRequired ??
    settings.messagesForXp;

  const messageProgress =
    account.messageCount;

  const embed =
    new EmbedBuilder()
      .setTitle("📈 Level")
      .setDescription(
        `${user} is **Level ${level}**.`
      )
      .addFields(
        {
          name: "⭐ XP",
          value: account.xp.toLocaleString(),
          inline: true
        },
        {
          name: "📊 Next Level",
          value:
            `${progress.toLocaleString()} / ${needed.toLocaleString()}`,
          inline: true
        },
        {
          name: "💬 XP Progress",
          value:
            `${messageProgress} / ${messagesRequired} messages`,
          inline: true
        }
      );

  await interaction.reply({
    embeds: [embed],
    flags: MessageFlags.Ephemeral
  });
}

async function showLeaderboard(interaction) {
  const {
    getLeaderboard,
    levelFromXp
  } = require("./economy");

  const users =
    await getLeaderboard(
      interaction.guildId,
      10
    );

  if (!users.length) {
    await interaction.reply({
      content:
        "📊 There is no XP data yet.",
      flags: MessageFlags.Ephemeral
    });

    return;
  }

  const lines = [];

  for (
    let index = 0;
    index < users.length;
    index++
  ) {
    const user = users[index];

    const member =
      await interaction.guild.members
        .fetch(user.userId)
        .catch(() => null);

    const name =
      member?.user?.username ||
      user.userId;

    lines.push(
      `**${index + 1}.** ${name} — ` +
      `Level ${levelFromXp(user.xp)} — ` +
      `${user.xp.toLocaleString()} XP`
    );
  }

  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setTitle("🏆 XP Leaderboard")
        .setDescription(
          lines.join("\n")
        )
    ],
    flags: MessageFlags.Ephemeral
  });
}

async function showInventory(interaction) {
  const user =
    interaction.options.getUser("user") ||
    interaction.user;

  const purchases =
    await getPurchasesCollection()
      .aggregate([
        {
          $match: {
            guildId: interaction.guildId,
            userId: user.id
          }
        },
        {
          $group: {
            _id: "$itemId",
            itemName: {
              $first: "$itemName"
            },
            quantity: {
              $sum: 1
            }
          }
        },
        {
          $sort: {
            itemName: 1
          }
        }
      ])
      .toArray();

  if (!purchases.length) {
    await interaction.reply({
      content:
        `${user} doesn't have anything in their inventory yet.`,
      flags: MessageFlags.Ephemeral
    });

    return;
  }

  const lines =
    purchases.map(
      (item) =>
        `🛒 **${item.itemName}** × ${item.quantity}`
    );

  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setTitle("🎒 Inventory")
        .setDescription(
          lines.join("\n")
        )
    ],
    flags: MessageFlags.Ephemeral
  });
}

async function handleCoinsCommand(interaction) {
  const {
    addCoins,
    removeCoins,
    setCoins
  } = require("./economy");

  const subcommand =
    interaction.options.getSubcommand();

  const user =
    interaction.options.getUser(
      "user",
      true
    );

  const amount =
    interaction.options.getInteger(
      "amount",
      true
    );

  let account;

  if (subcommand === "add") {
    account =
      await addCoins(
        interaction.guildId,
        user.id,
        amount
      );
  }

  if (subcommand === "remove") {
    account =
      await removeCoins(
        interaction.guildId,
        user.id,
        amount
      );
  }

  if (subcommand === "set") {
    account =
      await setCoins(
        interaction.guildId,
        user.id,
        amount
      );
  }

  await interaction.reply({
    content:
      `✅ ${user} now has **${formatCoins(account.coins)}**.`,
    flags: MessageFlags.Ephemeral
  });
}

async function handleXpCommand(interaction) {
  const {
    addXp,
    removeXp,
    setXp,
    getXpSettings,
    setXpSettings
  } = require("./economy");

  const subcommand =
    interaction.options.getSubcommand();

  if (subcommand === "add") {
    const user =
      interaction.options.getUser(
        "user",
        true
      );

    const amount =
      interaction.options.getInteger(
        "amount",
        true
      );

    const account =
      await addXp(
        interaction.guildId,
        user.id,
        amount
      );

    await interaction.reply({
      content:
        `✅ Added **${amount} XP** to ${user}.\n` +
        `⭐ New XP: **${account.xp}**`,
      flags: MessageFlags.Ephemeral
    });

    return;
  }

  if (subcommand === "remove") {
    const user =
      interaction.options.getUser(
        "user",
        true
      );

    const amount =
      interaction.options.getInteger(
        "amount",
        true
      );

    const account =
      await removeXp(
        interaction.guildId,
        user.id,
        amount
      );

    await interaction.reply({
      content:
        `✅ Removed **${amount} XP** from ${user}.\n` +
        `⭐ New XP: **${account.xp}**`,
      flags: MessageFlags.Ephemeral
    });

    return;
  }

  if (subcommand === "set") {
    const user =
      interaction.options.getUser(
        "user",
        true
      );

    const amount =
      interaction.options.getInteger(
        "amount",
        true
      );

    const account =
      await setXp(
        interaction.guildId,
        user.id,
        amount
      );

    await interaction.reply({
      content:
        `✅ Set ${user}'s XP to **${account.xp}**.`,
      flags: MessageFlags.Ephemeral
    });

    return;
  }

  if (subcommand === "settings") {
    const messagesForXp =
      interaction.options.getInteger(
        "messages_for_xp"
      );

    const messageIncrease =
      interaction.options.getInteger(
        "message_increase"
      );

    const xpPerReward =
      interaction.options.getInteger(
        "xp_per_reward"
      );

    const settings =
      await setXpSettings(
        interaction.guildId,
        {
          messagesForXp,
          messageIncrease,
          xpPerReward
        }
      );

    await interaction.reply({
      content:
        `✅ XP settings updated.\n\n` +
        `💬 Starting messages: **${settings.messagesForXp}**\n` +
        `📈 Increase: **+${settings.messageIncrease} messages**\n` +
        `⭐ XP per reward: **${settings.xpPerReward} XP**`,
      flags: MessageFlags.Ephemeral
    });
  }
}

const shopCommands = [
  new SlashCommandBuilder()
    .setName("shop")
    .setDescription(
      "View the server shop."
    ),

  new SlashCommandBuilder()
    .setName("shop-add")
    .setDescription(
      "Add an item to the server shop."
    )
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageGuild
    )
    .addStringOption((option) =>
      option
        .setName("name")
        .setDescription(
          "Item name."
        )
        .setRequired(true)
        .setMaxLength(100)
    )
    .addStringOption((option) =>
      option
        .setName("description")
        .setDescription(
          "Item description."
        )
        .setRequired(true)
        .setMaxLength(1000)
    )
    .addIntegerOption((option) =>
      option
        .setName("price")
        .setDescription(
          "Price in Coins."
        )
        .setRequired(true)
        .setMinValue(0)
    )
    .addIntegerOption((option) =>
      option
        .setName("stock")
        .setDescription(
          "Stock. 0 = unlimited."
        )
        .setMinValue(0)
    )
    .addStringOption((option) =>
      option
        .setName("category")
        .setDescription(
          "Shop category."
        )
        .setMaxLength(100)
    )
    .addStringOption((option) =>
      option
        .setName("emoji")
        .setDescription(
          "Item emoji."
        )
        .setMaxLength(10)
    )
    .addIntegerOption((option) =>
      option
        .setName("purchase_limit")
        .setDescription(
          "Purchases per user. 0 = unlimited."
        )
        .setMinValue(0)
    )
    .addRoleOption((option) =>
      option
        .setName("required_role")
        .setDescription(
          "Role required to buy the item."
        )
    ),

  new SlashCommandBuilder()
    .setName("shop-edit")
    .setDescription(
      "Edit a server shop item."
    )
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageGuild
    )
    .addStringOption((option) =>
      option
        .setName("item")
        .setDescription(
          "Current item name."
        )
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("name")
        .setDescription(
          "New name."
        )
        .setMaxLength(100)
    )
    .addStringOption((option) =>
      option
        .setName("description")
        .setDescription(
          "New description."
        )
        .setMaxLength(1000)
    )
    .addIntegerOption((option) =>
      option
        .setName("price")
        .setDescription(
          "New price."
        )
        .setMinValue(0)
    )
    .addIntegerOption((option) =>
      option
        .setName("stock")
        .setDescription(
          "New stock. 0 = unlimited."
        )
        .setMinValue(0)
    )
    .addStringOption((option) =>
      option
        .setName("category")
        .setDescription(
          "New category."
        )
        .setMaxLength(100)
    )
    .addStringOption((option) =>
      option
        .setName("emoji")
        .setDescription(
          "New emoji."
        )
        .setMaxLength(10)
    )
    .addIntegerOption((option) =>
      option
        .setName("purchase_limit")
        .setDescription(
          "New purchase limit. 0 = unlimited."
        )
        .setMinValue(0)
    ),

  new SlashCommandBuilder()
    .setName("shop-delete")
    .setDescription(
      "Delete a shop item."
    )
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageGuild
    )
    .addStringOption((option) =>
      option
        .setName("item")
        .setDescription(
          "Item name."
        )
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("shop-toggle")
    .setDescription(
      "Enable or disable a shop item."
    )
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageGuild
    )
    .addStringOption((option) =>
      option
        .setName("item")
        .setDescription(
          "Item name."
        )
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("balance")
    .setDescription(
      "View a user's Coin balance."
    )
    .addUserOption((option) =>
      option
        .setName("user")
        .setDescription(
          "User to check."
        )
    ),

  new SlashCommandBuilder()
    .setName("level")
    .setDescription(
      "View a user's XP level."
    )
    .addUserOption((option) =>
      option
        .setName("user")
        .setDescription(
          "User to check."
        )
    ),

  new SlashCommandBuilder()
    .setName("leaderboard")
    .setDescription(
      "View the XP leaderboard."
    ),

  new SlashCommandBuilder()
    .setName("inventory")
    .setDescription(
      "View a user's shop inventory."
    )
    .addUserOption((option) =>
      option
        .setName("user")
        .setDescription(
          "User to check."
        )
    ),

  new SlashCommandBuilder()
    .setName("coins")
    .setDescription(
      "Manage Coins."
    )
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageGuild
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("add")
        .setDescription(
          "Give Coins to a user."
        )
        .addUserOption((option) =>
          option
            .setName("user")
            .setDescription(
              "User."
            )
            .setRequired(true)
        )
        .addIntegerOption((option) =>
          option
            .setName("amount")
            .setDescription(
              "Amount."
            )
            .setRequired(true)
            .setMinValue(1)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("remove")
        .setDescription(
          "Remove Coins from a user."
        )
        .addUserOption((option) =>
          option
            .setName("user")
            .setDescription(
              "User."
            )
            .setRequired(true)
        )
        .addIntegerOption((option) =>
          option
            .setName("amount")
            .setDescription(
              "Amount."
            )
            .setRequired(true)
            .setMinValue(1)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("set")
        .setDescription(
          "Set a user's Coins."
        )
        .addUserOption((option) =>
          option
            .setName("user")
            .setDescription(
              "User."
            )
            .setRequired(true)
        )
        .addIntegerOption((option) =>
          option
            .setName("amount")
            .setDescription(
              "Amount."
            )
            .setRequired(true)
            .setMinValue(0)
        )
    ),

  new SlashCommandBuilder()
    .setName("xp")
    .setDescription(
      "Manage XP."
    )
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageGuild
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("add")
        .setDescription(
          "Give XP to a user."
        )
        .addUserOption((option) =>
          option
            .setName("user")
            .setDescription(
              "User."
            )
            .setRequired(true)
        )
        .addIntegerOption((option) =>
          option
            .setName("amount")
            .setDescription(
              "Amount."
            )
            .setRequired(true)
            .setMinValue(1)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("remove")
        .setDescription(
          "Remove XP from a user."
        )
        .addUserOption((option) =>
          option
            .setName("user")
            .setDescription(
              "User."
            )
            .setRequired(true)
        )
        .addIntegerOption((option) =>
          option
            .setName("amount")
            .setDescription(
              "Amount."
            )
            .setRequired(true)
            .setMinValue(1)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("set")
        .setDescription(
          "Set a user's XP."
        )
        .addUserOption((option) =>
          option
            .setName("user")
            .setDescription(
              "User."
            )
            .setRequired(true)
        )
        .addIntegerOption((option) =>
          option
            .setName("amount")
            .setDescription(
              "Amount."
            )
            .setRequired(true)
            .setMinValue(0)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("settings")
        .setDescription(
          "Change automatic chat XP settings."
        )
        .addIntegerOption((option) =>
          option
            .setName("messages_for_xp")
            .setDescription(
              "Messages needed for the first XP reward."
            )
            .setMinValue(1)
        )
        .addIntegerOption((option) =>
          option
            .setName("message_increase")
            .setDescription(
              "Extra messages required after each reward."
            )
            .setMinValue(0)
        )
        .addIntegerOption((option) =>
          option
            .setName("xp_per_reward")
            .setDescription(
              "XP given each time."
            )
            .setMinValue(1)
        )
    )
];

async function handleShopCommand(
  interaction
) {
  const command =
    interaction.commandName;

  if (
    [
      "shop-add",
      "shop-edit",
      "shop-delete",
      "shop-toggle",
      "coins",
      "xp"
    ].includes(command)
  ) {
    if (!isManager(interaction)) {
      await interaction.reply({
        content:
          "❌ Only server managers can use this command.",
        flags: MessageFlags.Ephemeral
      });

      return true;
    }
  }

  if (command === "shop") {
    await showShop(interaction);
    return true;
  }

  if (command === "shop-add") {
    await createShopItem(interaction);
    return true;
  }

  if (command === "shop-edit") {
    await editItemFromCommand(interaction);
    return true;
  }

  if (command === "shop-delete") {
    const name =
      interaction.options.getString(
        "item",
        true
      );

    const item =
      await findItemByName(
        interaction.guildId,
        name
      );

    if (!item) {
      await interaction.reply({
        content:
          "❌ Shop item not found.",
        flags: MessageFlags.Ephemeral
      });

      return true;
    }

    await getItemsCollection().deleteOne({
      _id: item._id,
      guildId: interaction.guildId
    });

    await interaction.reply({
      content:
        `🗑️ **${item.name}** was deleted.`,
      flags: MessageFlags.Ephemeral
    });

    return true;
  }

  if (command === "shop-toggle") {
    const name =
      interaction.options.getString(
        "item",
        true
      );

    const item =
      await findItemByName(
        interaction.guildId,
        name
      );

    if (!item) {
      await interaction.reply({
        content:
          "❌ Shop item not found.",
        flags: MessageFlags.Ephemeral
      });

      return true;
    }

    await getItemsCollection().updateOne(
      {
        _id: item._id,
        guildId: interaction.guildId
      },
      {
        $set: {
          enabled: !item.enabled,
          updatedAt: Date.now()
        }
      }
    );

    await interaction.reply({
      content:
        item.enabled
          ? `🔴 **${item.name}** is now disabled.`
          : `🟢 **${item.name}** is now enabled.`,
      flags: MessageFlags.Ephemeral
    });

    return true;
  }

  if (command === "balance") {
    await showBalance(interaction);
    return true;
  }

  if (command === "level") {
    await showLevel(interaction);
    return true;
  }

  if (command === "leaderboard") {
    await showLeaderboard(interaction);
    return true;
  }

  if (command === "inventory") {
    await showInventory(interaction);
    return true;
  }

  if (command === "coins") {
    await handleCoinsCommand(interaction);
    return true;
  }

  if (command === "xp") {
    await handleXpCommand(interaction);
    return true;
  }

  return false;
}

async function handleShopInteraction(
  interaction
) {
  const id =
    interaction.customId || "";

  if (!id.startsWith("shop_")) {
    return false;
  }

  if (!isManager(interaction) &&
      !id.startsWith("shop_buy:")) {
    await interaction.reply({
      content:
        "❌ Only server managers can use this control.",
      flags: MessageFlags.Ephemeral
    });

    return true;
  }

  if (id.startsWith("shop_buy:")) {
    const itemId =
      id.split(":")[1];

    await purchaseItem(
      interaction,
      itemId
    );

    return true;
  }

  if (id.startsWith("shop_manage:")) {
    const itemId =
      id.split(":")[1];

    await showManagerPanel(
      interaction,
      itemId
    );

    return true;
  }

  if (id.startsWith("shop_edit:")) {
    const itemId =
      id.split(":")[1];

    await showEditModal(
      interaction,
      itemId
    );

    return true;
  }

  if (
    id.startsWith(
      "shop_edit_modal:"
    )
  ) {
    const itemId =
      id.split(":")[1];

    await saveModalEdit(
      interaction,
      itemId
    );

    return true;
  }

  if (
    id.startsWith(
      "shop_delete_confirm:"
    )
  ) {
    const itemId =
      id.split(":")[1];

    await showDeleteConfirmation(
      interaction,
      itemId
    );

    return true;
  }

  if (
    id.startsWith(
      "shop_delete:"
    )
  ) {
    const itemId =
      id.split(":")[1];

    await deleteItem(
      interaction,
      itemId
    );

    return true;
  }

  if (
    id.startsWith(
      "shop_toggle:"
    )
  ) {
    const itemId =
      id.split(":")[1];

    await toggleItem(
      interaction,
      itemId
    );

    return true;
  }

  if (
    id.startsWith(
      "shop_add_discount:"
    )
  ) {
    const itemId =
      id.split(":")[1];

    await showRoleDiscountSelector(
      interaction,
      itemId
    );

    return true;
  }

  if (
    id.startsWith(
      "shop_discount_role:"
    )
  ) {
    const itemId =
      id.split(":")[1];

    const roleId =
      interaction.values[0];

    await showDiscountModal(
      interaction,
      itemId,
      roleId
    );

    return true;
  }

  if (
    id.startsWith(
      "shop_discount_modal:"
    )
  ) {
    const parts =
      id.split(":");

    const itemId = parts[1];
    const roleId = parts[2];

    await saveRoleDiscount(
      interaction,
      itemId,
      roleId
    );

    return true;
  }

  if (
    id.startsWith(
      "shop_manage_discounts:"
    )
  ) {
    const itemId =
      id.split(":")[1];

    await showDiscountManager(
      interaction,
      itemId
    );

    return true;
  }

  if (
    id.startsWith(
      "shop_discount_manage_select:"
    )
  ) {
    const itemId =
      id.split(":")[1];

    const roleId =
      interaction.values[0];

    await showDiscountActions(
      interaction,
      itemId,
      roleId
    );

    return true;
  }

  if (
    id.startsWith(
      "shop_change_discount:"
    )
  ) {
    const parts =
      id.split(":");

    const itemId = parts[1];
    const roleId = parts[2];

    await showDiscountModal(
      interaction,
      itemId,
      roleId
    );

    return true;
  }

  if (
    id.startsWith(
      "shop_remove_discount:"
    )
  ) {
    const parts =
      id.split(":");

    const itemId = parts[1];
    const roleId = parts[2];

    await removeRoleDiscount(
      interaction,
      itemId,
      roleId
    );

    return true;
  }

  return true;
}

module.exports = {
  shopCommands,
  handleShopCommand,
  handleShopInteraction
};
