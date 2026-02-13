-- Task serialization handler for OmniFocus
-- Requires: json.applescript helpers (jsonString, jsonArray, escapeJson)

-- Serialize a task to JSON
-- Returns a JSON object string for the given task
on serializeTask(t)
	set taskId to id of t
	set taskName to name of t
	set taskNote to note of t
	set taskFlagged to flagged of t
	set taskCompleted to completed of t

	-- Safe date access
	set dueStr to ""
	try
		set dueStr to (due date of t) as string
	end try

	set deferStr to ""
	try
		set deferStr to (defer date of t) as string
	end try

	set completionStr to ""
	try
		set completionStr to (completion date of t) as string
	end try

	-- Safe project access
	set projId to ""
	set projName to ""
	try
		set proj to containing project of t
		set projId to id of proj
		set projName to name of proj
	end try

	-- Get tag names
	set tagNames to {}
	repeat with tg in tags of t
		set end of tagNames to name of tg
	end repeat

	-- Safe estimated minutes
	set estMinutes to 0
	try
		set estMinutes to estimated minutes of t
		if estMinutes is missing value then set estMinutes to 0
	end try

	return "{" & ¬
		"\"id\": \"" & taskId & "\"," & ¬
		"\"name\": \"" & (my escapeJson(taskName)) & "\"," & ¬
		"\"note\": " & (my jsonString(taskNote)) & "," & ¬
		"\"flagged\": " & taskFlagged & "," & ¬
		"\"completed\": " & taskCompleted & "," & ¬
		"\"dueDate\": " & (my jsonString(dueStr)) & "," & ¬
		"\"deferDate\": " & (my jsonString(deferStr)) & "," & ¬
		"\"completionDate\": " & (my jsonString(completionStr)) & "," & ¬
		"\"projectId\": " & (my jsonString(projId)) & "," & ¬
		"\"projectName\": " & (my jsonString(projName)) & "," & ¬
		"\"tags\": " & (my jsonArray(tagNames)) & "," & ¬
		"\"estimatedMinutes\": " & estMinutes & ¬
		"}"
end serializeTask
