/*  DepressedPress.com DP_ObCollectionOrdered

Author: Jim Davis, the Depressed Press of Boston
Date: July 26, 2004
Contact: webmaster@depressedpress.com
Website: www.depressedpress.com

Full documentation can be found at:
http://www.depressedpress.com/Content/Development/JavaScript/Extensions/DP_ObCollectionOrdered/Index.cfm

DP_ObCollectionOrdereds are used to manage groups of object instances ("Members") and abstract common group tasks.

	+ An DP_ObCollectionOrdered maintains the order (rank) of it members.
	+ Members of an DP_ObCollectionOrdered may be optionally validated for type.
	+ A property of Member objects must contain a unique Key to be used as the member identifier. 

Constructor
	new DP_ObCollectionOrdered(MemberKeyName, MemberType)
		"MemberKeyName" is the name of the property in the member objects to be used as a Key.
		"MemberType" is a reference to the constructor for the member class used.

Methods
	isMember(MemberKey):
		Test to see if a member exists in the collection
	add(NewMember, AllowOverwrite):
		Adds a new member to the collection
	drop(MemberKey):
		Drops a member from the collection
	dropAll() or clear():
		Empties the collection.
	getCount():
		Returns the count of objects in the collection
	get(MemberKey):
		Returns a member object
	getAt(Rank):
		Returns the member object at the specified position (index) in the collection
	getRank(MemberKey):
		Returns the current position (index) of the specified object
	getAll():
		Returns a direct reference to the members array
	promote(MemberKey, Steps):
		Moves a member up in rank (down in position/index)
	promoteAt(Index, Steps):
		Moves the member at the specified position up in rank (down in position/index)
	demote(MemberKey, Steps):
		Moves a member down in rank (up in position/index)
	demoteAt(Index, Steps):
		Moves the member at the specified position down in rank (up in position/index)
	swap(MemberKey1, MemberKey2):
		Swaps the positions of two member objects in the collection
	swapAt(Index1, Index2):
		Swaps the positions of the two member objects at the specified positions
	setRank(MemberKey, NewRank):
		Sets the rank (position/index) of a member object
	setRankAt(Index, NewRank):
		Sets the rank of the member object at the specified position
	getKeys():
		Returns an array of all the member object key values
	isValidType(ObjectToCheck):
		Checks if an object is the correct type for inclusion in the collection
	isIndexInRange(Index):
		Determines if an integer is in the range of indexes used by the collection
	sort(OrderFunction):
		Sorts the collection using a provided sorting function
	sortByProp(Property,SortType,Order):
		Sorts the collection by a specified member object property

Copyright (c) 1996-2005, The Depressed Press of Boston (depressedpress.com)

All rights reserved.

Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:

+) Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer. 

+) Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution. 

+) Neither the name of the DEPRESSED PRESS OF BOSTON (DEPRESSEDPRESS.COM) nor the names of its contributors may be used to endorse or promote products derived from this software without specific prior written permission. 

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

*/


	// Constuctor DP_ObCollectionOrdered()
	// Usage
	//		Instantiates a new DP_ObCollectionOrdered
	// Parameters
	//		MemberKeyName: The property to be used as the unique identifier for DP_ObCollectionOrdered members.
	//		Type: A reference to the constructor of the objects to be stored in the DP_ObCollectionOrdered
	// Return DP_ObCollectionOrdered
	//
function DP_ObCollectionOrdered(MemberKeyName, MemberType) {

		// Create the Members container
	this.Members = new Array();

		// Set the Member Properties
	this.MemberKeyName = MemberKeyName;
	if ( !MemberType ) {
		this.MemberType = MemberType;
	} else {
		this.MemberType = null;
	};

		// Create general information vars
	this.CreationDate = new Date();

		// Return, the DP_ObCollectionOrdered object
	return this;

};


/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - */
/* Membership Management Methods */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - */


	// Method isMember()
	// Usage
	//		Determines if a member exists in the DP_ObCollectionOrdered
	// Parameters
	//		MemberKey: The key of the object to be checked or a reference to the object
	// Return (Boolean)
	//		"true" if the member exists in the DP_ObCollectionOrdered
	//		"false" if the member doesn't exist in the DP_ObCollectionOrdered
	//
DP_ObCollectionOrdered.prototype.isMember = function isMember(MemberKey) {

		// Determine if the "MemberKey" passed is, in fact, a member object
	if ( this.isValidType(MemberKey) ) {
		MemberKey = MemberKey[this.MemberKeyName];
	};

	var Rank = this.getRank(MemberKey);
	if ( Rank == null ) {
		return false;
	} else {
		return true;
	};

};


	// Method add()
	// Usage
	//		Adds a new member to the DP_ObCollectionOrdered.
	// Parameters
	//		NewMember: An object to be added to the DP_ObCollectionOrdered
	//		AllowOverwrite: (Optional, defaults to "false"): If false will not allow an object to overwrite an existing object with the same key value.
	// Return (Boolean)
	//		"true" if the member ID is added
	//		"false" if the add fails (due to type validation, for example)
	//
DP_ObCollectionOrdered.prototype.add = function add(NewMember, AllowOverwrite) {

		// Is the object of the right type?
	if ( !this.isValidType(NewMember) ) {
			// Return, the type is incorrect
		return false;
	};

		// Get the Member Key
	var NewMemberKey = NewMember[this.MemberKeyName];

		// Can we overwrite?
	if ( typeof AllowOverwrite != "boolean" ) {
		AllowOverwrite = false;
	};
		// Get the Rank if the key exists
	var Rank = this.getRank(NewMemberKey);
	if ( Rank != null ) {
		if ( AllowOverwrite ) {
			this.Members[Rank] = NewMember;
			return true;
		} else {
			return false;
		};
	};

		// Add the new record
	this.Members[this.getCount()] = NewMember;
		// Return, the member was added
	return true;

};


	// Method drop()
	// Usage
	//		Removes a member from the DP_ObCollectionOrdered by member Key.
	// Parameters
	//		MemberKey: The key of the object to be dropped or a reference to the object
	// Return Boolean
	//		"true" if the member ID was in the DP_ObCollectionOrdered
	//		"false" if the member ID was not in the DP_ObCollectionOrdered to begin with
	//
DP_ObCollectionOrdered.prototype.drop = function drop(MemberKey) {

		// Determine if the "MemberKey" passed is, in fact, a member object
	if ( typeof MemberKey == "object" && this.isValidType(MemberKey) ) {
		MemberKey = MemberKey[this.MemberKeyName];
	};

		// Get the Rank if the key exists
	var Rank = this.getRank(MemberKey);
	if ( Rank == null ) {
			// Return, The member is not in the collection
		return false;
	} else {

			// Loop over the old array and add elements to the new
		var NewMembers = new Array();
		for (var Cnt = 0; Cnt < this.Members.length; Cnt++) {
			if ( Cnt != Rank ) {
				NewMembers[NewMembers.length] = this.Members[Cnt];
			};
		};

			// Update the collection with new array
		this.Members = NewMembers;
			// Return, the key has been dropped
		return true;

	};

};


	// Method dropAll() [alternative clear()]
	// Usage
	//		Removes all members from the DP_ObCollectionOrdered.
	// Parameters
	//		none
	// Return Boolean
	//		"true" is the only return
	//
DP_ObCollectionOrdered.prototype.dropAll = DP_ObCollectionOrdered.prototype.clear;
DP_ObCollectionOrdered.prototype.clear = function dropAll() {

		// Update the collection with new array
	this.Members = new Array();

		// Return
	return true;

};


/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - */
/* General Information Methods */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - */


	// getCount()
	// Usage
	//		Gets a count of the current DP_ObCollectionOrdered members
	// Parameters
	//		None
	// Return (Integer)
	//		The number of DP_ObCollectionOrdered members 
	//
DP_ObCollectionOrdered.prototype.getCount = function getCount() {

		// Return, the count of members
	return this.Members.length;

};


	// Method isEmpty()
	// Usage
	//		Gets a count of the current DP_ObCollectionOrdered members
	// Parameters
	//		None
	// Return (Boolean)
	//		"true" if no members exist, "false" if members exist 
	//
DP_ObCollectionOrdered.prototype.isEmpty = function isEmpty() {

		// Return, the count of members
	return (this.getCount() == 0);

};


/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - */
/* Get Methods */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - */


	// Method get()
	// Usage
	//		Returns a member from the DP_ObCollectionOrdered by Key.
	// Parameters
	//		MemberKey: The key of the object or a reference to the object
	// Return (Object)
	//		The member object specified or null should the object not exist
	//
DP_ObCollectionOrdered.prototype.get = function get(MemberKey) {

		// Determine if the "MemberKey" passed is, in fact, a member object
	if ( typeof MemberKey == "object" && this.isValidType(MemberKey) ) {
		MemberKey = MemberKey[this.MemberKeyName];
	};

		// Get the Rank
	var Rank = this.getRank(MemberKey);
	if ( Rank != null ) {
		return this.Members[Rank];
	} else {
		return null;
	};

};


	// Method getAt()
	// Usage
	//		Returns the Member at the specified rank
	// Parameters
	//		Index: The index to check
	// Return (Object)
	//		The member at the specified rank
	//
DP_ObCollectionOrdered.prototype.getAt = function getAt(Rank) {

	return this.Members[Rank];

};


	// Method getRank()
	// Usage
	//		Returns the current rank of a member
	// Parameters
	//		MemberKey: The key of the object or a reference to the object
	// Return (Integer)
	//		The rank of the member, "null" if the member doesn't exist
	//
DP_ObCollectionOrdered.prototype.getRank = function getRank(MemberKey) {

		// Determine if the "MemberKey" passed is, in fact, a member object
	if ( typeof MemberKey == "object" && this.isValidType(MemberKey) ) {
		MemberKey = MemberKey[this.MemberKeyName];
	};

	var Rank = null;

	for ( var Cnt = 0; Cnt < this.Members.length; Cnt++ ) {
		if ( this.Members[Cnt][this.MemberKeyName] == MemberKey ) {
			Rank = Cnt;
			break;
		};
	};

		// Return, the member rank
	return Rank;

};


	// Method getAll()
	// Usage
	//		Returns a reference to the Members Array.
	// Parameters
	//		none
	// Return (Array)
	//		A reference to the Members Array
	//
DP_ObCollectionOrdered.prototype.getAll = function getAll() {

	return this.Members;

};


/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - */
/* Rank Management Methods */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - */


	// Method promote()
	// Usage
	//		Moves a member up in rank (decreases its index)
	// Parameters
	//		MemberKey: The key of the object or a reference to the object
	//		Steps (default "1"): The number of steps to promote the member
	// Return (Integer)
	//		The new rank of the member 
	//
DP_ObCollectionOrdered.prototype.promote = function promote(MemberKey, Steps) {

		// Determine if the "MemberKey" passed is, in fact, a member object
	if ( typeof MemberKey == "object" && this.isValidType(MemberKey) ) {
		MemberKey = MemberKey[this.MemberKeyName];
	};

		// Get the current position
	var CurPosition = this.getRank(MemberKey);
		// Call promoteAt() to do the work
	return this.promoteAt(CurPosition, Steps);

};


	// Method promoteAt()
	// Usage
	//		Moves the Member at the specified index up in rank (decreases its index)
	// Parameters
	//		Index: The member to move
	//		Steps (default "1"): The number of steps to promote the member
	// Return (Integer)
	//		The new rank of the member, "null" if the process fails
	//
DP_ObCollectionOrdered.prototype.promoteAt = function promoteAt(Index, Steps) {

		// Default steps
	if ( Steps == null ) { Steps = 1 };
		// Determine the new rank
	var NewIndex = Index - Steps;
	if ( !this.isIndexInRange(NewIndex) ) {
		NewIndex = 0;
	};

		// Call setRankAt() do to the work
	if ( this.setRankAt(Index, NewIndex) ) {
		return NewIndex;	
	} else {
		return null;
	};

};


	// Method demote()
	// Usage
	//		Moves a member down in rank (increases its index)
	// Parameters
	//		MemberKey: The key of the object or a reference to the object
	//		Steps (default "1"): The number of steps to demote the member
	// Return (Integer)
	//		The new rank of the member 
	//
DP_ObCollectionOrdered.prototype.demote = function demote(MemberKey, Steps) {

		// Determine if the "MemberKey" passed is, in fact, a member object
	if ( typeof MemberKey == "object" && this.isValidType(MemberKey) ) {
		MemberKey = MemberKey[this.MemberKeyName];
	};

		// Get the current position
	var CurPosition = this.getRank(MemberKey);
		// Call demoteAt() to do the work
	return this.demoteAt(CurPosition, Steps);

};


	// Method demoteAt()
	// Usage
	//		Moves the member at the specified index down in rank (increases its index)
	// Parameters
	//		Index: The member to move
	//		Steps (default "1"): The number of steps to demote the member
	// Return (Integer)
	//		The new rank of the member, "null" if the process fails
	//
DP_ObCollectionOrdered.prototype.demoteAt = function demoteAt(Index, Steps) {

		// Default steps
	if ( Steps == null ) { Steps = 1 };
		// Determine the new rank
	var NewIndex = Index + Steps;
	if ( !this.isIndexInRange(NewIndex) ) {
		NewIndex = this.getCount() - 1;
	};

		// Call setRankAt() do to the work
	if ( this.setRankAt(Index, NewIndex) ) {
		return 	NewIndex;	
	} else {
		return null;
	};

};


	// Method swap()
	// Usage
	//		Swaps the ranks of two members by MemberKey.
	// Parameters
	//		MemberKey1: The key of the first object to be moved or a reference to the object
	//		MemberKey2:  The key of the second object to be moved or a reference to the object
	// Return (Boolean)
	//		"true" upon completion 
	//
DP_ObCollectionOrdered.prototype.swap = function swap(MemberKey1, MemberKey2) {

		// Determine if the "MemberKey" passed is, in fact, a member object
	if ( typeof MemberKey1 == "object" && this.isValidType(MemberKey1) ) {
		MemberKey1 = MemberKey[this.MemberKeyName];
	};
		// Determine if the "MemberKey" passed is, in fact, a member object
	if ( typeof MemberKey2 == "object" && this.isValidType(MemberKey2) ) {
		MemberKey2 = MemberKey[this.MemberKeyName];
	};

	var Member1Rank = this.getRank(MemberKey1);
	var Member2Rank = this.getRank(MemberKey2);

		// Call swapAt() to do the work
	return this.swapAt(Member1Rank, Member2Rank);

};


	// Method swapAt()
	// Usage
	//		Swaps the ranks of two members by index (rank).
	// Parameters
	//		Index1: The first index to move
	//		Index2: The second index to move
	// Return (Boolean)
	//		"true" upon completion 
	//
DP_ObCollectionOrdered.prototype.swapAt = function swapAt(Index1, Index2) {

	var TempCell = this.Members[Index1];
	this.Members[Index1] = this.Members[Index2];
	this.Members[Index2] = TempCell;
	
	return true;

};


	// Method setRank()
	// Usage
	//		Sets the rank of a member (Removes it from one position and inserts in another).
	// Parameters
	//		MemberKey: The key of the object to be checked or a reference to the object
	//		NewRank: The second index to move
	// Return (Boolean)
	//		"true" upon completion, "false" if the move could not be made (if the selected index was out of range, for example)
	//
DP_ObCollectionOrdered.prototype.setRank = function setRank(MemberKey, NewRank) {

		// Determine if the "MemberKey" passed is, in fact, a member object
	if ( typeof MemberKey == "object" && this.isValidType(MemberKey) ) {
		MemberKey = MemberKey[this.MemberKeyName];
	};

		// Get the current Rank of the member
	var CurRank = this.getRank(MemberKey);
		// Call setRankAt() to set the new rank
	return this.setRankAt(CurRank, NewRank);

};


	// Method setRankAt()
	// Usage
	//		Sets the rank of the member at the specified index (Removes it from one position and inserts in another).
	// Parameters
	//		Index: The index of the member to move
	//		NewRank: The second index to move
	// Return (Boolean)
	//		"true" upon completion, "false" if the move could not be made (if the selected index was out of range, for example)
	//
DP_ObCollectionOrdered.prototype.setRankAt = function setRankAt(Index, NewIndex) {

		// Test the ranges
	if ( !this.isIndexInRange(Index) || !this.isIndexInRange(NewIndex) ) {
			// Return, the element can't be moved or doesn't exist
		return false;
	};

		// If the current and requested positions are the same, don't bother
	if (Index != NewIndex) {

		var NewMembers = new Array();
		var TempCell = this.Members[Index];

		for ( var Cnt = 0; Cnt < this.getCount(); Cnt++ ) {
				// If the member is being promoted this must come first
			if ( ( Index > NewIndex ) && ( Cnt == NewIndex ) ) {
				NewMembers[NewMembers.length] = TempCell;
			};
				// Assign all old objects except the one being moved to the new array
			if ( Cnt != Index ) {
				NewMembers[NewMembers.length] = this.Members[Cnt];
			};
				// If the member is being demoted this must come last
			if ( ( Index < NewIndex ) && ( Cnt == NewIndex ) ) {
				NewMembers[NewMembers.length] = TempCell;
			};
		};

			// Update the collection with new array
		this.Members = NewMembers;

	};

		// Return, action complete
	return true;

};


/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - */
/* Export Methods */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - */


	// Method getKeys()
	// Usage
	//		Returns an Array of all the DP_ObCollectionOrdered member keys.
	// Parameters
	//		MemberID: The member to be returned
	// Return (Object)
	//		The member object specified
	//
DP_ObCollectionOrdered.prototype.getKeys = function getKeys() {

	var KeyArray = new Array();
	for ( var Cnt = 0; Cnt < this.getCount(); Cnt++ ) {
		KeyArray[Cnt] = this.Members[Cnt][this.MemberKeyName];
	};

		// Return, the Array
	return KeyArray;

};


/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - */
/* Utility Methods */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - */


	// Method isValidType()
	// Usage
	//		Checks the type of a passed object
	// Parameters
	//		ObjectToCheck: An object to check for type
	// Return (Boolean)
	//		"true" if the object of of the proper type, "false" if not
	//
DP_ObCollectionOrdered.prototype.isValidType = function isValidType(ObjectToCheck) {

		// If the collection does not define a type, return true
	if ( this.MemberType == null ) {
		return true;
	};

		// If we're checking a type, do it
	if ( ( typeof ObjectToCheck == "object" ) && ( ObjectToCheck.constructor == this.MemberType ) ) {
			// Return, the object is the correct type
		return true;
	} else {
			// Return, the object is not the correct type
		return false;
	};

};


	// Method isIndexInRange()
	// Usage
	//		Checks to see if the passed integer is in range of the current collection
	// Parameters
	//		Index
	// Return (Boolean)
	//		"true" if the index is in range, "false" if not
	//
DP_ObCollectionOrdered.prototype.isIndexInRange = function isIndexInRange(Index) {

	if ( ( Index >= 0 ) && ( Index < this.getCount() ) ) {
			// Return, the index is in range
		return true;
	} else {
			// Return, the index is not in range
		return false;
	};

};


/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - */
/* Sorting Methods */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - */

	// Method sort()
	// Usage
	//		Sorts the Collection using a passed function
	// Parameters
	//		OrderFunction: The function used to sort.  Should follow the same rules as the core JavaScript array.sort()
	// Return (Boolean)
	//		"true" when the sort completes
	//
DP_ObCollectionOrdered.prototype.sort = function sort(OrderFunction) {

		// Use the core Array Sort function to sort the members
	this.Members.sort(OrderFunction);

		// Return
	return true;

};

	// Method sortByProp()
	// Usage
	//		Sorts the Collection
	// Parameters
	//		Property: The property to sort by
	//		SortType: The type of sort "Numeric", "Alpha" or "AlphaNoCase".  Defaults to "Alpha".
	//		Order: "asc" (ascending) or "desc" (descending).  Defaults to "Asc".
	// Return (Boolean)
	//		"true" when the sort completes
	//
DP_ObCollectionOrdered.prototype.sortByProp = function sortByProp(Property, SortType, Order) {

		// Default Parameters
	if ( SortType == null ) { SortType = "Alpha" };
	if ( Order == null ) { Order = "asc" };

		// Determine the type of the sort and generate the function for testing
	switch ( SortType.toLowerCase() ) {
		case "numeric" :
			var SortFunction = function(A,B) { return A[Property] - B[Property] };
			break;
		case "alphanocase" :
			var SortFunction = function(A,B) { if ( A[Property].toLowerCase() < B[Property].toLowerCase() ) return -1; if ( A[Property].toLowerCase() > B[Property].toLowerCase() ) return 1; return 0  };
			break;
		default :
			var SortFunction = function(A,B) { if ( A[Property] < B[Property] ) return -1; if ( A[Property] > B[Property] ) return 1; return 0  };
			break;
	};

		// Sort the Array
	this.Members.sort(SortFunction);

		// If the order is "Desc" then reverse the Array
	if ( Order.toLowerCase() == "desc" ) {
		this.Members.reverse();
	};

};