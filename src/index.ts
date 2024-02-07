/* eslint-disable @typescript-eslint/no-unused-vars */
import {
  ChatInputCommandInteraction,
  Client,
  GuildMember,
  IntentsBitField,
  TextBasedChannel,
  TextChannel,
} from "discord.js";
import { REST } from "@discordjs/rest";
import { Routes } from "discord-api-types/v9";
import { SlashCommandBuilder } from "@discordjs/builders";
import {
  DiscordGatewayAdapterCreator,
  joinVoiceChannel,
  getVoiceConnection,
} from "@discordjs/voice";
import { config } from "dotenv";
import winston from "winston";
import { SpotifyPlugin } from "@distube/spotify";
import { DisTube } from "distube";
import { AudioPlayer, createAudioPlayer } from "@discordjs/voice";

// Load environment variables
config();

// Initialize logger
const logger = winston.createLogger({
  level: "info",
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: "error.log", level: "error" }),
    new winston.transports.Console({ format: winston.format.simple() }),
  ],
});

// Extract sensitive data from environment variables
const token = process.env.TOKEN;
const clientId = process.env.CLIENTID;
const guildId = process.env.GUILDID;
const focusChannel = "1203029262765137970";
const restChannel = "1204573502162599976"; // replace with your rest channel id

// const modal = new ModalBuilder().setCustomId("pomodoro").setTitle("Pomodoro");
// const a1 = new TextInputBuilder()
//   .setCustomId("working-time")
//   .setLabel("Working Time")
//   .setStyle(TextInputStyle.Paragraph)
//   .setMinLength(1)
//   .setPlaceholder("20min")
//   .setRequired(true)
//   .setMaxLength(4);

// const a2 = new TextInputBuilder()
//   .setCustomId("break-time")
//   .setLabel("Break Time")
//   .setStyle(TextInputStyle.Paragraph)
//   .setMinLength(1)
//   .setPlaceholder("5min")
//   .setRequired(true)
//   .setMaxLength(4);

// const a3 = new TextInputBuilder()
//   .setCustomId("number-of-times")
//   .setLabel("Number of Times (x times)")
//   .setStyle(TextInputStyle.Paragraph)
//   .setPlaceholder("4")
//   .setRequired(true)
//   .setMaxLength(1);

// const actionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(
//   a1,
//   a2,
//   a3
// );
// modal.addComponents(actionRow);

// Define commands
const commands = [
  new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Replies with Pong!")
    .toJSON(),
  new SlashCommandBuilder()
    .setName("setpomodorotime")
    .setDescription("Set a time for your pomodoro (in minutes)")
    .addStringOption((option) =>
      option
        .setName("working-time")
        .setDescription("Choose a time")
        .setRequired(true)
        .addChoices(
          { name: "20 minutes", value: "20" },
          { name: "25 minutes", value: "25" },
          { name: "30 minutes", value: "30" },
          { name: "45 minutes", value: "45" }
        )
    )
    .addStringOption((option) =>
      option
        .setName("break-time")
        .setDescription("Choose a time")
        .setRequired(true)
        .addChoices(
          { name: "5 minutes", value: "5" },
          { name: "10 minutes", value: "10" },
          { name: "15 minutes", value: "15" },
          { name: "20 minutes", value: "20" }
        )
    )
    .addStringOption((option) =>
      option
        .setName("number-of-times")
        .setDescription("Choose how many times you want to work")
        .setRequired(true)
        .addChoices(
          { name: "1 time", value: "1" },
          { name: "2 times", value: "2" },
          { name: "3 times", value: "3" },
          { name: "4 times", value: "4" }
        )
    )
    .toJSON(),
];

// Initialize REST client
const rest = new REST({ version: "9" }).setToken(token as string);

// Refresh application commands
(async () => {
  try {
    logger.info("Started refreshing application (/) commands.");
    await rest.put(
      Routes.applicationGuildCommands(clientId as string, guildId as string),
      {
        body: commands,
      }
    );
    logger.info("Successfully reloaded application (/) commands.");
  } catch (error) {
    logger.error(error);
  }
})();

// Initialize Discord client
const client = new Client({
  intents: [
    IntentsBitField.Flags.Guilds,
    IntentsBitField.Flags.GuildMessages,
    IntentsBitField.Flags.GuildMembers,
    IntentsBitField.Flags.MessageContent,
    IntentsBitField.Flags.GuildPresences,
    IntentsBitField.Flags.GuildVoiceStates,
  ],
});

// Log in to Discord
client.login(token);

// Handle ready event
client.on("ready", (c) => {
  logger.info(`${c.user.username} is ready`);
  client?.user?.setPresence({
    activities: [{ name: "Listening to commands" }],
    status: "online",
  });
});

const distube = new DisTube(client, {
  plugins: [new SpotifyPlugin()],
});

client.on("messageCreate", async (message) => {
  if (!message.guild) return;
  if (message.author.bot) return;
  if (!message.content.startsWith("#play")) return;

  const args = message.content.split(" ").slice(1);
  const music = args.join(" ");

  // Make sure the user is in a voice channel
  const voiceChannel = message.member?.voice.channel;
  if (!voiceChannel) {
    message.reply("You need to be in a voice channel to play music!");
    return;
  }

  // Ensure the channel is a text channel within a guild
  const textChannel = message.channel;
  if (!textChannel.isTextBased()) {
    message.reply("Music commands can only be used in a server text channel.");
    return;
  }

  // Play the music
  try {
    distube.play(voiceChannel, music, {
      member: message.member,
      textChannel: textChannel as TextChannel,
      message,
      // Additional options
    });
  } catch (error) {
    message.channel.send("An error occurred while trying to play music.");
    console.error(error);
  }
});
distube.on("playSong", (queue, song) => {
  queue?.textChannel?.send(`Playing: ${song.name}`);
});
distube.on("error", (channel, error) => {
  console.error(error);
  channel?.send("An error occurred: " + error.message);
});

const handlePomodoro = async (interaction: ChatInputCommandInteraction) => {
  const workingTime = interaction.options.get("working-time")?.value as number;
  const breakTime = interaction.options.get("break-time")?.value as number;
  const numberOfTimes = interaction.options.get("number-of-times")
    ?.value as number;
  const member = interaction.user.id;
  const GuildMember = interaction.member as GuildMember;
  await GuildMember.voice.setMute(true);

  for (let i = 0; i < numberOfTimes; i++) {
    // Move user to focus channel and start working timer
    await GuildMember.voice.setChannel(focusChannel);
    await GuildMember.voice.setMute(true);
    await joinVoiceChannel({
      channelId: focusChannel,
      guildId: interaction.guildId as string,
      adapterCreator: interaction?.guild
        ?.voiceAdapterCreator as DiscordGatewayAdapterCreator,
    });

    i === 0
      ? await interaction.reply(`Working for ${workingTime} minutes`)
      : await interaction.editReply(`Working for ${workingTime} minutes`);
    await new Promise((resolve) => setTimeout(resolve, 30 * 1000));
    await interaction.editReply(
      `Working Time is over! Rest for ${breakTime} minutes`
    );
    if (i === numberOfTimes - 1) {
      await interaction.editReply(`Pomodoro cycles completed!`);
      await GuildMember.voice.setMute(false);
      await GuildMember.voice.setChannel(restChannel);
      const connection = getVoiceConnection(interaction.guildId as string);
      if (connection) {
        connection.destroy();
      }
      break;
    }

    // Move user to rest channel and start break timer
    await GuildMember.voice.setChannel(restChannel);
    await GuildMember.voice.setMute(false);

    await new Promise((resolve) => setTimeout(resolve, 60 * 1000));
  }

  //   After all cycles, move user back to focus channel and send completion message
  // await GuildMember.voice.setChannel(restChannel);
  // await interaction.editReply(`Pomodoro cycles completed!`);
};

// Handle interactionCreate event
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isCommand()) return;

  const { commandName, options } = interaction;
  if (commandName === "setpomodorotime" && interaction.isChatInputCommand()) {
    if (!interaction.guild || !interaction.member) return;

    const member = interaction.member as GuildMember;
    const voiceChannelId = member.voice.channelId;
    if (!voiceChannelId) {
      await interaction.reply(
        "You need to be in a voice channel to use this command!"
      );
      return;
    }

    const botMember = interaction.guild.members.cache.get(
      client?.user?.id as string
    );
    if (botMember?.voice.channel) {
      await interaction.reply(
        "The bot is already connected to a voice channel."
      );
      return;
    }

    try {
      const voiceChannel = await interaction.guild.channels.fetch(
        voiceChannelId
      );
      if (!voiceChannel || !voiceChannel.isVoiceBased()) {
        await interaction.reply("Could not find the voice channel you are in.");
        return;
      }

      //   await joinVoiceChannel({
      //     channelId: voiceChannelId,
      //     guildId: interaction.guildId as string,
      //     adapterCreator: interaction.guild.voiceAdapterCreator,
      //   });

      // const reply = [
      //   `You want to work for ${options.get("working-time")?.value} minutes`,
      //   `You want to rest for ${options.get("break-time")?.value} minutes`,
      //   `You want to work ${options.get("number-of-times")?.value} times`,
      // ];
      await handlePomodoro(interaction);
      // await interaction.reply(`Joined the voice channel!\n${reply.join("\n")}`);
    } catch (error) {
      logger.error(error);
      await interaction.reply("Failed to join the voice channel.");
    }
  }
});

// const handlePomodoro = async (interaction: ChatInputCommandInteraction) => {
//   await interaction.reply(
//     `Working for ${interaction.options.get("working-time")?.value} minutes`
//   );
//   const timeOut = setTimeout(async () => {
//     await interaction.editReply(
//       `Working Time is over! Rest for ${
//         interaction.options.get("break-time")?.value
//       } minutes`
//     );
//   }, (interaction.options.get("working-time")?.value as number) * 60 * 1000);

//   clearTimeout(timeOut);

//   const breakInterval = setInterval(async () => {
//     await interaction.editReply(
//       `Break Time is over! Working for ${
//         interaction.options.get("working-time")?.value
//       } minutes`
//     );
//   }, (interaction.options.get("break-time")?.value as number) * 60 * 1000);
// };
