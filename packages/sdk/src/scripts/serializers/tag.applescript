-- Tag serialization handler for OmniFocus
-- Requires: json.applescript helpers (jsonString, escapeJson)

-- Serialize a tag to JSON
-- Returns a JSON object string for the given tag
on serializeTag(theTag)
	set tagId to id of theTag
	set tagName to name of theTag

	-- Safe parent access
	set parentId to ""
	set parentName to ""
	try
		set theContainer to container of theTag
		set parentId to id of theContainer
		set parentName to name of theContainer
	on error
		-- No parent or container is not a tag
	end try

	set availCount to count of (available tasks of theTag)

	return "{" & ¬
		"\"id\": \"" & tagId & "\"," & ¬
		"\"name\": \"" & (my escapeJson(tagName)) & "\"," & ¬
		"\"parentId\": " & (my jsonString(parentId)) & "," & ¬
		"\"parentName\": " & (my jsonString(parentName)) & "," & ¬
		"\"availableTaskCount\": " & availCount & ¬
		"}"
end serializeTag
