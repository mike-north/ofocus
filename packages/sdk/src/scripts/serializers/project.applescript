-- Project serialization handler for OmniFocus
-- Requires: json.applescript helpers (jsonString, escapeJson)

-- Serialize a project to JSON
-- Returns a JSON object string for the given project
on serializeProject(p)
	set projId to id of p
	set projName to name of p
	set projNote to note of p
	set projSeq to sequential of p

	-- Safely determine project status
	set projStatus to "active"
	try
		set theStatus to status of p
		if theStatus is on hold status then
			set projStatus to "on-hold"
		else if theStatus is done status then
			set projStatus to "completed"
		else if theStatus is dropped status then
			set projStatus to "dropped"
		end if
	end try

	-- Safe folder access
	set folderId to ""
	set folderName to ""
	try
		set f to folder of p
		set folderId to id of f
		set folderName to name of f
	end try

	set taskCount to count of tasks of p
	set remainingCount to count of (tasks of p where completed is false)

	return "{" & ¬
		"\"id\": \"" & projId & "\"," & ¬
		"\"name\": \"" & (my escapeJson(projName)) & "\"," & ¬
		"\"note\": " & (my jsonString(projNote)) & "," & ¬
		"\"status\": \"" & projStatus & "\"," & ¬
		"\"sequential\": " & projSeq & "," & ¬
		"\"folderId\": " & (my jsonString(folderId)) & "," & ¬
		"\"folderName\": " & (my jsonString(folderName)) & "," & ¬
		"\"taskCount\": " & taskCount & "," & ¬
		"\"remainingTaskCount\": " & remainingCount & ¬
		"}"
end serializeProject
