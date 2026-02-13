-- Folder serialization handler for OmniFocus
-- Requires: json.applescript helpers (jsonString, escapeJson)

-- Serialize a folder to JSON
-- Returns a JSON object string for the given folder
on serializeFolder(f)
	set folderId to id of f
	set folderName to name of f

	-- Safe parent access
	set parentId to ""
	set parentName to ""
	try
		set p to container of f
		if class of p is folder then
			set parentId to id of p
			set parentName to name of p
		end if
	end try

	set projCount to count of projects of f
	set subFolderCount to count of folders of f

	return "{" & ¬
		"\"id\": \"" & folderId & "\"," & ¬
		"\"name\": \"" & (my escapeJson(folderName)) & "\"," & ¬
		"\"parentId\": " & (my jsonString(parentId)) & "," & ¬
		"\"parentName\": " & (my jsonString(parentName)) & "," & ¬
		"\"projectCount\": " & projCount & "," & ¬
		"\"folderCount\": " & subFolderCount & ¬
		"}"
end serializeFolder
