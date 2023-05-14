import { fetchMemosWithResource } from "@kirika/core"
import { App, Notice, Plugin, PluginSettingTab, Setting } from "obsidian"

interface MemosSyncPluginSettings {
	openAPI: string
	folderToSync: string
	debug: boolean
	lastSyncTime?: number
}

const DEFAULT_SETTINGS: MemosSyncPluginSettings = {
	openAPI: "",
	folderToSync: "Memos Sync",
	debug: false,
}

export default class MemosSyncPlugin extends Plugin {
	settings: MemosSyncPluginSettings

	async onload() {
		await this.loadSettings()

		this.addRibbonIcon("refresh-ccw", "Memos Sync", this.sync.bind(this))
		this.addSettingTab(new MemosSyncSettingTab(this.app, this))
	}

	onunload() {}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData())
	}

	async saveSettings() {
		await this.saveData(this.settings)
	}

	async debug(message: string) {
		if (this.settings.debug) {
			new Notice(message, 0)
		}
	}

	async log(message: string, duration?: number) {
		new Notice(message, duration)
	}

	async sync() {
		await this.loadSettings()
		const { openAPI, folderToSync, lastSyncTime } = this.settings

		if (openAPI === "") {
			this.log("Please enter your OpenAPI key.")
			return
		}

		try {
			this.log("Start syncing memos.")

			const res = await fetchMemosWithResource(openAPI)
			this.debug(
				`Fetch memos from API successfully. Total: ${res.memos.length}`
			)

			const vault = this.app.vault
			const adapter = this.app.vault.adapter

			const isMemosFolderExists = await adapter.exists(`${folderToSync}/memos`)
			if (!isMemosFolderExists) {
				await vault.createFolder(`${folderToSync}/memos`)
				this.debug("Created memos folder.")
			}
			const isResourcesFolderExists = await adapter.exists(
				`${folderToSync}/resources`
			)
			if (!isResourcesFolderExists) {
				await vault.createFolder(`${folderToSync}/resources`)
				this.debug("Created resources folder.")
			}

			res.memos.forEach((memo) => {
				const memoPath = `${folderToSync}/memos/${memo.id}.md`
				const memoContent = memo.content
				const lastUpdated = memo.updatedTs

				if (lastSyncTime && lastUpdated * 1000 < lastSyncTime) {
					this.debug(
						`Skip memo ${memo.id}, because ${
							lastUpdated * 1000
						} < ${lastSyncTime}`
					)
					return
				}
				adapter.write(memoPath, memoContent)
				this.debug(`Synced memo: ${memo.id}`)
			})

			res.resources.forEach(async (resource) => {
				const resourcePath = `${folderToSync}/resources/${resource.filename}`

				const isResourceExists = await adapter.exists(resourcePath)
				if (isResourceExists) {
					return
				}

				const resourceContent = resource.content
				adapter.writeBinary(resourcePath, resourceContent)
				this.debug(`Synced resource: ${resource.filename}`)
			})

			// delete memos and resources that are not in the API response
			const memosInAPI = res.memos.map(
				(memo) => `${folderToSync}/memos/${memo.id}.md`
			)
			const resourcesInAPI = res.resources.map(
				(resource) => `${folderToSync}/resources/${resource.filename}`
			)

			const memosInVault = await adapter.list(`${folderToSync}/memos`)
			memosInVault.files.forEach(async (memo) => {
				if (!memosInAPI.includes(memo)) {
					await adapter.remove(memo)
					this.debug(`Deleted memo: ${memo}`)
				}
			})

			const resourcesInVault = await adapter.list(`${folderToSync}/resources`)
			resourcesInVault.files.forEach(async (resource) => {
				if (!resourcesInAPI.includes(resource)) {
					await adapter.remove(resource)
					this.debug(`Deleted resource: ${resource}`)
				}
			})

			this.log(`Sync memos successfully.`)

			this.saveData({
				...this.settings,
				lastSyncTime: Date.now(),
			})
		} catch (e) {
			this.log(
				"Failed to sync memos. Please check your OpenAPI key and network.",
				0
			)
			console.error(e)
		}
	}
}

class MemosSyncSettingTab extends PluginSettingTab {
	plugin: MemosSyncPlugin

	constructor(app: App, plugin: MemosSyncPlugin) {
		super(app, plugin)
		this.plugin = plugin
	}

	display(): void {
		const { containerEl } = this

		containerEl.empty()

		containerEl.createEl("h2", { text: "Settings for Memos Sync." })

		new Setting(containerEl)
			.setName("OpenAPI")
			.setDesc("Find your OpenAPI key at your memos settings.")
			.addText((text) =>
				text
					.setPlaceholder("Enter your OpenAPI key")
					.setValue(this.plugin.settings.openAPI)
					.onChange(async (value) => {
						console.log("Secret: " + value)
						this.plugin.settings.openAPI = value
						await this.plugin.saveSettings()
					})
			)

		new Setting(containerEl)
			.setName("Folder to sync")
			.setDesc("The folder to sync memos and resources.")
			.addText((text) =>
				text
					.setPlaceholder("Enter the folder name")
					.setValue(this.plugin.settings.folderToSync)
					.onChange(async (value) => {
						if (value === "") {
							new Notice("Please enter the folder name.")
							return
						}
						this.plugin.settings.folderToSync = value
						await this.plugin.saveSettings()
					})
			)

		new Setting(containerEl)
			.setName("Debug")
			.setDesc("Enable debug mode.")
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.debug).onChange(async (value) => {
					this.plugin.settings.debug = value
					await this.plugin.saveSettings()
				})
			)
	}
}