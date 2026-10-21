/**
 * EMCP_WB_Ping.c - Health check handler for EnfusionMCP Workbench bridge
 *
 * Returns status and current editor mode (edit vs game).
 * Called via NET API TCP protocol: APIFunc = "EMCP_WB_Ping"
 */

class EMCP_WB_PingRequest : JsonApiStruct
{
	void EMCP_WB_PingRequest()
	{
		// No request parameters needed for ping
	}
}

class EMCP_WB_PingResponse : JsonApiStruct
{
	string status;
	string mode;
	string message;
	string projectPath;
	string logPath;
	string reloadProtocol;

	void EMCP_WB_PingResponse()
	{
		RegV("status");
		RegV("mode");
		RegV("message");
		RegV("projectPath");
		RegV("logPath");
		RegV("reloadProtocol");
	}
}

class EMCP_WB_Ping : NetApiHandler
{
	override JsonApiStruct GetRequest()
	{
		return new EMCP_WB_PingRequest();
	}

	override JsonApiStruct GetResponse(JsonApiStruct request)
	{
		EMCP_WB_PingResponse resp = new EMCP_WB_PingResponse();
		resp.reloadProtocol = "native-v1";

		// GetCurrentGameProjectFile returns the base game's .gproj, not the
		// addon selected at startup. Query the actual -gproj argument instead.
		System.GetCLIParam("gproj", resp.projectPath);
		Workbench.GetAbsolutePath("$logs:console.log", resp.logPath, true);

		WorldEditor worldEditor = Workbench.GetModule(WorldEditor);
		if (!worldEditor)
		{
			resp.status = "ok";
			resp.mode = "no_world_editor";
			resp.message = "EnfusionMCP Workbench bridge active (no WorldEditor module)";
			return resp;
		}

		WorldEditorAPI api = worldEditor.GetApi();
		if (api)
		{
			resp.status = "ok";
			resp.mode = "edit";
			if (api.IsGameMode()) resp.mode = "play";
			resp.message = "EnfusionMCP Workbench bridge active";
		}
		else
		{
			resp.status = "ok";
			resp.mode = "unknown";
			resp.message = "EnfusionMCP Workbench bridge active (WorldEditorAPI unavailable; mode unknown)";
		}

		return resp;
	}
}
