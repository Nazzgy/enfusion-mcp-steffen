/** Prepare a correlated reload. The client invokes native ReloadScripts only
 * after this NET API request has returned and all script instances are released. */
class EMCP_WB_ReloadRequest : JsonApiStruct
{
	string target;
	string operationId;
	string phase;
	void EMCP_WB_ReloadRequest()
	{
		RegV("target");
		RegV("operationId");
		RegV("phase");
	}
}

class EMCP_WB_ReloadResponse : JsonApiStruct
{
	string status;
	string message;
	void EMCP_WB_ReloadResponse()
	{
		RegV("status");
		RegV("message");
	}
}

class EMCP_WB_Reload : NetApiHandler
{
	override JsonApiStruct GetRequest()
	{
		return new EMCP_WB_ReloadRequest();
	}

	override JsonApiStruct GetResponse(JsonApiStruct request)
	{
		EMCP_WB_ReloadRequest req = EMCP_WB_ReloadRequest.Cast(request);
		EMCP_WB_ReloadResponse resp = new EMCP_WB_ReloadResponse();
		resp.status = "error";
		if (req.phase != "prepare" || req.operationId == "")
		{
			resp.message = "Reload requires the updated two-request MCP client. Restart MCP; no reload was dispatched.";
			return resp;
		}
		if (req.target != "scripts")
		{
			resp.message = "Only native game-script reload is supported safely. Plugin reload must use the native Workbench UI.";
			return resp;
		}
		WorldEditor editor = Workbench.GetModule(WorldEditor);
		if (editor)
		{
			WorldEditorAPI api = editor.GetApi();
			if (api && api.IsGameMode())
			{
				resp.message = "Stop Play before reloading scripts.";
				return resp;
			}
		}
		Print("[EnfusionMCP compilation " + req.operationId + "]");
		resp.status = "prepared";
		resp.message = "Marker recorded. Invoke native ReloadScripts in a separate request after this response.";
		return resp;
	}
}
