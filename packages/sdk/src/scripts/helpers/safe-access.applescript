-- Safe property access helpers for OmniFocus AppleScript integration
-- These handlers safely extract properties that may be missing or cause errors

-- Get a date property as string, returning empty string if not set
on safeDateString(theObject, propertyName)
	set dateStr to ""
	try
		if propertyName is "due date" then
			set dateStr to (due date of theObject) as string
		else if propertyName is "defer date" then
			set dateStr to (defer date of theObject) as string
		else if propertyName is "completion date" then
			set dateStr to (completion date of theObject) as string
		else if propertyName is "modification date" then
			set dateStr to (modification date of theObject) as string
		else if propertyName is "creation date" then
			set dateStr to (creation date of theObject) as string
		end if
	end try
	return dateStr
end safeDateString

-- Get containing project info (id and name) from a task
-- Returns a record {projId: "", projName: ""} with empty strings if no project
on safeProjectInfo(theTask)
	set projId to ""
	set projName to ""
	try
		set proj to containing project of theTask
		set projId to id of proj
		set projName to name of proj
	end try
	return {projId:projId, projName:projName}
end safeProjectInfo

-- Get parent folder info (id and name) from an entity (project or folder)
-- Returns a record {folderId: "", folderName: ""} with empty strings if no folder
on safeFolderInfo(theEntity)
	set folderId to ""
	set folderName to ""
	try
		set f to folder of theEntity
		set folderId to id of f
		set folderName to name of f
	end try
	return {folderId:folderId, folderName:folderName}
end safeFolderInfo

-- Get estimated minutes from a task, returning 0 if not set
on safeEstimatedMinutes(theTask)
	set estMinutes to 0
	try
		set estMinutes to estimated minutes of theTask
		if estMinutes is missing value then set estMinutes to 0
	end try
	return estMinutes
end safeEstimatedMinutes

-- Get tag names from an entity as a list
on safeTagNames(theEntity)
	set tagNames to {}
	repeat with tg in tags of theEntity
		set end of tagNames to name of tg
	end repeat
	return tagNames
end safeTagNames
