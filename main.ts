import {
  App,
  MarkdownEditView,
  MarkdownView,
  Modal,
  Notice,
  Plugin,
  PluginSettingTab,
  ProgressBarComponent,
  Setting,
  TextAreaComponent,
  TextComponent,
} from "obsidian";
import { cachedFetchCalendar, insertCalendarDay } from "./ical";
import { parse } from "@markwhen/parser";
import {
  getDateFromFile,
  appHasDailyNotesPluginLoaded,
} from "obsidian-daily-notes-interface";
import { CalendarResponse } from "node-ical";
import { fetchText } from "./fetch";
interface TFSettings {
  CalendarURL: string;
}
const DEFAULT_SETTINGS: TFSettings = {
  CalendarURL: "",
};
export default class TF extends Plugin {
  settings: TFSettings;
  sync: Function;

  async onload() {
    await this.loadSettings();
    this.sync();

    const oneMinute = 60 * 1000;
    this.registerInterval(window.setInterval(() => this.sync(), oneMinute));

    this.addCommand({
      id: "daily-note-fetch",
      name: "Insert Calendar into Daily Note",
      checkCallback: (checking: boolean) => {
        let leaf = this.app.workspace.getActiveViewOfType(MarkdownView);
        console.log(leaf);
        if (!appHasDailyNotesPluginLoaded()) {
          new Notice("TF requires the daily notes plugin to be enabled");
        }

        if (leaf) {
          const date = getDateFromFile(leaf.file, "day");
          if (date === null) {
            return false;
          }

          if (!checking) {
            this.sync().then((calendar: CalendarResponse) => {
              insertCalendarDay(calendar, date, leaf.editor);
            });
          }
          return true;
        }
        return false;
      },
    });

    this.addSettingTab(new TFSettingTab(this.app, this));
    this.registerMarkdownCodeBlockProcessor("markwhen", (source, el, ctx) => {
      const parsed = parse(source);
      console.log(parsed);
      console.log(el);
      console.log(ctx);
      // TODO: Get html into Obsidian preview pane
    });
  }
  onunload() {}

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    this.sync = cachedFetchCalendar(this.settings.CalendarURL);
  }
  async saveSettings() {
    await this.saveData(this.settings);
    this.sync = cachedFetchCalendar(this.settings.CalendarURL);
  }
}

class TFSettingTab extends PluginSettingTab {
  plugin: TF;
  errors: string;
  state: number;

  constructor(app: App, plugin: TF) {
    super(app, plugin);
    this.plugin = plugin;
    this.errors = "";
    this.state = 0;
    this.display();
  }
  display(): void {
    let { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "TF Settings" });
    new Setting(containerEl)
      .setName("Google Calendar Link")
      .setDesc("Secret Address in iCal format")
      .addText((text) =>
        text
          .setPlaceholder("ICS URL")
          .setValue(this.plugin.settings.CalendarURL)
          .onChange(async (value) => {
            this.plugin.settings.CalendarURL = value;
            await this.plugin.saveSettings();
          })
      )
      .addButton((button) => {
        button.setButtonText("Test").onClick(async () => {
          this.errors = "";
          this.state = 37;
          this.display();
          try {
            await fetchText(this.plugin.settings.CalendarURL, (error, data) => {
              if (error) {
                this.errors = error;
                throw error;
              }
              this.errors = "";
              this.state = 57;
              this.display();
              this.plugin.sync();
              this.state = 100;
              this.display();
            });
          } catch (error) {
            this.errors = error;
            this.display();
          }
        });
      });
    const progress = new ProgressBarComponent(containerEl);
    progress.setValue(this.state);

    const logDisplay = containerEl.createEl("pre");
    logDisplay.style.fontFamily = "monospace";
    logDisplay.style.fontSize = "12px";
    logDisplay.style.width = "100%";
    //logDisplay.style.padding = "8px";
    logDisplay.style.overflowY = "auto"; // Enable vertical scrolling if content exceeds height
    logDisplay.style.maxHeight = "200px"; // Max height before scrolling
    logDisplay.textContent = this.errors;
  }
}
