/**
 * EMCP_WB_Reload.c - Script and plugin reload handler
 *
 * Triggers script compilation via ScriptEditor module.
 * Called via NET API TCP protocol: APIFunc = "EMCP_WB_Reload"
 */

class EMCP_WB_ReloadRequest : JsonApiStruct
{
	string target;

	void EMCP_WB_ReloadRequest()
	{
		RegV("target");
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

		string target = req.target;
		if (target == "")
			target = "scripts";

		if (target != "scripts" && target != "plugins" && target != "both")
		{
			resp.status = "error";
			resp.message = "Unknown reload target: " + target;
			return resp;
		}
		bool accepted = true;
		array<string> results = {};

		if (target == "scripts" || target == "both")
		{
			ScriptEditor scriptEditor = Workbench.GetModule(ScriptEditor);
			if (scriptEditor)
			{
				// Try known menu paths for script compilation in ScriptEditor
				array<string> menuPath = {};
				bool compiled = false;

				// Try "Script, Compile" first
				menuPath.Insert("Script");
				menuPath.Insert("Compile");
				compiled = scriptEditor.ExecuteAction(menuPath);

				if (!compiled)
				{
					// Try "Build, Compile All"
					menuPath.Clear();
					menuPath.Insert("Build");
					menuPath.Insert("Compile All");
					compiled = scriptEditor.ExecuteAction(menuPath);
				}

				if (!compiled)
				{
					// Try "Script, Compile All"
					menuPath.Clear();
					menuPath.Insert("Script");
					menuPath.Insert("Compile All");
					compiled = scriptEditor.ExecuteAction(menuPath);
				}

				if (!compiled)
				{
					// Try via WorldEditor as fallback
					WorldEditor worldEditor = Workbench.GetModule(WorldEditor);
					if (worldEditor)
					{
						menuPath.Clear();
						menuPath.Insert("Plugins");
						menuPath.Insert("Reload Scripts");
						compiled = worldEditor.ExecuteAction(menuPath);
					}
				}

				if (compiled)
					results.Insert("Scripts: reload action dispatched; compilation success is not verified.");
				else
				{
					accepted = false;
					results.Insert("Scripts: ExecuteAction returned false for all attempted paths; use Script Editor Shift+F7 and inspect the compile log.");
				}
			}
			else
			{
				accepted = false;
				results.Insert("Scripts: ScriptEditor module not available");
			}
		}

		if (target == "plugins" || target == "both")
		{
			ResourceManager resMgr = Workbench.GetModule(ResourceManager);
			if (resMgr)
			{
				array<string> menuPath = {};
				menuPath.Insert("Plugins");
				menuPath.Insert("Reload");
				bool result = resMgr.ExecuteAction(menuPath);
				if (result)
					results.Insert("Plugins: reload action dispatched; completion is not verified.");
				else
				{
					accepted = false;
					results.Insert("Plugins: ExecuteAction returned false; reload was not dispatched.");
				}
			}
			else
			{
				accepted = false;
				results.Insert("Plugins: ResourceManager module not available");
			}
		}

		resp.status = "requested";
		if (!accepted) resp.status = "error";
		string msg = "";
		for (int i = 0; i < results.Count(); i++)
		{
			if (i > 0)
				msg = msg + " | ";
			msg = msg + results[i];
		}
		resp.message = msg;

		return resp;
	}
}
